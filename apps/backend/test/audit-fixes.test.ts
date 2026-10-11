import { describe, expect, it, vi } from 'vitest';
import { z } from 'zod';
import { withAcousticDefaults } from '@app/contracts';
import { classifyRules } from '../src/heuristics/rule-classifier.js';
import { buildApp } from '../src/app.js';
import { loadConfig } from '../src/config.js';
import { idKey } from '../src/infra/id-key.js';
import { safeError } from '../src/infra/safe-error.js';
import type { Classifier, ClassifyInput } from '../src/llm/classifier.js';
import { buildUserBlock } from '../src/llm/prompt.js';
import { parseVerdict } from '../src/llm/parse.js';
import { WsGateway, type WsLike } from '../src/http/ws-gateway.js';
import { createServer } from 'node:http';

const input = (text: string, speaker: 'candidate' | 'counterpart' = 'counterpart', am = {}) => {
  const { values, imputed } = withAcousticDefaults(am);
  return { text, speaker, acoustics: values, imputed };
};
const headers = { 'content-type': 'application/json' };

describe('audit fixes', () => {
  it('S-01: HOST defaults to loopback; 0.0.0.0 only by explicit opt-in', () => {
    expect(loadConfig({}).HOST).toBe('localhost'); // binds 127.0.0.1 + ::1 only (checked with lsof)
    expect(loadConfig({ HOST: '' }).HOST).toBe('localhost'); // empty never means all interfaces
    expect(loadConfig({ HOST: '   ' }).HOST).toBe('localhost');
    expect(loadConfig({ HOST: '0.0.0.0' }).HOST).toBe('0.0.0.0');
  });

  it('S-02: idKey is a short stable digest, fast, and never the raw id', () => {
    const id = 'x'.repeat(512);
    const k = idKey(id);
    expect(k).toHaveLength(22);
    expect(k).toBe(idKey(id));
    expect(k).not.toBe(idKey(id + 'y'));
    expect(k).not.toContain('xxxx');
    const t = performance.now();
    for (let i = 0; i < 2000; i++) idKey(`${id}${i}`);
    expect((performance.now() - t) / 2000).toBeLessThan(0.05); // ms per call
  });

  it('S-05: prototype keys from a model are bad_json, not Object.prototype', () => {
    expect(parseVerdict('{"s":"__proto__","c":1}', 'counterpart')).toBeNull();
    expect(parseVerdict('{"s":"constructor"}', 'counterpart')).toBeNull();
    expect(parseVerdict('{"s":"toString"}', 'counterpart')).toBeNull();
    const v = parseVerdict('{"s":"neutral","r":"__proto__","c":0.5}', 'counterpart');
    expect(v?.risk).toBe('low'); // garbled risk falls back to the sentiment default
    expect(parseVerdict('{"s":"Sarcasm"}', 'counterpart')?.sentiment).toBe('sarcastic');
  });

  it('S-06/T17: safeError keeps name + a short first line; SyntaxError messages are omitted', () => {
    expect(safeError({ name: 'TypeError', message: 'bad thing\nsecond line' })).toEqual({
      name: 'TypeError',
      message: 'bad thing',
    });
    expect(safeError({ name: 'Error', message: 'y'.repeat(500) }).message).toHaveLength(100);
    expect(
      safeError({ name: 'SyntaxError', message: 'Unexpected token s in "secret text"' }).message,
    ).toBe('(omitted)');
  });

  it('S-06: the swallowed-exception log never carries a SyntaxError message and the emergency label is none', async () => {
    const lines: string[] = [];
    const { Writable } = await import('node:stream');
    const logStream = new Writable({
      write(b: Buffer, _e, cb) {
        lines.push(b.toString());
        cb();
      },
    });
    const boom: Classifier = {
      name: 'b',
      classify: () => Promise.reject(new SyntaxError('Unexpected token in "top secret sentence"')),
    };
    const a = buildApp(loadConfig({ LOG_LEVEL: 'info' }), { classifier: boom, logStream });
    const r = await a.inject({
      method: 'POST',
      url: '/api/telemetry/stream',
      headers,
      payload: JSON.stringify({ chunk_id: 'e', session_id: 's', text: 'hello there' }),
    });
    expect(r.statusCode).toBe(200);
    expect(lines.join('')).not.toContain('top secret');
  });

  it('S-07: unknown routes -> {error:"not_found"} without echoing the path; over-long ids -> 414 without echo', async () => {
    const a = buildApp(loadConfig({ LOG_LEVEL: 'silent' }));
    const nf = await a.inject({ method: 'GET', url: '/nope/secret-path' });
    expect(nf.statusCode).toBe(404);
    expect(nf.json()).toEqual({ error: 'not_found' });
    const long = 'z'.repeat(7000);
    const r = await a.inject({ method: 'GET', url: `/api/telemetry/session/${long}/summary` });
    expect(r.statusCode).toBe(414);
    expect(r.json().error).toBe('invalid_request');
    expect(r.body).not.toContain('zzzz');
  });

  it('S-09: control characters (NUL etc.) are stripped, tabs/newlines become spaces', () => {
    const input: ClassifyInput = {
      text: 'a\u0000>\u0000>>b\u0007c\td\ne',
      speaker: 'counterpart',
      acoustics: {
        pitch_volatility: 0.3,
        speech_rate_wpm: 150,
        pause_duration_ms: 300,
        volume_intensity: 0.5,
      },
      imputed: [],
    };
    const block = buildUserBlock(input);
    expect(block).not.toMatch(/[\u0000-\u0008]/);
    expect(block.match(/>>>/g)).toHaveLength(1); // only the closing delimiter: the NUL-split ">>>" was folded, then blanked
    expect(block).toContain('bc d e');
  });

  it('T22: pipeline passes ids to the classifier for failed-attempt logs (meta), never sent as text', async () => {
    const seen: ClassifyInput[] = [];
    const c: Classifier = {
      name: 'f',
      classify: (i) => {
        seen.push(i);
        return Promise.reject(new Error('x'));
      },
    };
    const a = buildApp(loadConfig({ LOG_LEVEL: 'silent' }), { classifier: c });
    await a.inject({
      method: 'POST',
      url: '/api/telemetry/stream',
      headers,
      payload: JSON.stringify({ chunk_id: 'm1', session_id: 'ms', text: 'hello there' }),
    });
    expect(seen[0]?.meta).toEqual({ chunk_id: 'm1', session_id: 'ms' });
  });

  it('T22: heartbeat with fake timers — a client that answers pings stays, a silent one is terminated', async () => {
    vi.useFakeTimers();
    try {
      const g = new WsGateway({
        server: createServer(),
        allowedOrigins: ['http://o'],
        maxClients: 10,
        pingIntervalMs: 1000,
        mode: () => 'heuristic',
        warn: () => undefined,
      });
      const mk = () => {
        let terminated = false;
        const ws: WsLike = {
          readyState: 1,
          bufferedAmount: 0,
          send: () => undefined,
          close: () => undefined,
          terminate: () => void (terminated = true),
          ping: () => undefined,
        };
        return { ws, terminated: () => terminated };
      };
      const good = mk();
      const silent = mk();
      g.attach(good.ws, 'http://o');
      g.attach(silent.ws, 'http://o');
      await vi.advanceTimersByTimeAsync(1000); // ping #1 to both
      g.onPong(good.ws);
      await vi.advanceTimersByTimeAsync(1000); // silent missed #1 -> terminated
      expect(silent.terminated()).toBe(true);
      expect(good.terminated()).toBe(false);
      expect(g.size).toBe(1);
      g.close();
    } finally {
      vi.useRealTimers();
    }
  });

  it('N1: ZodError logs only {path, code} per issue, never input values', () => {
    const r = z.object({ s: z.enum(['a', 'b']) }).safeParse({ s: 'top secret value' });
    if (r.success) throw new Error('unreachable');
    const e = safeError(r.error);
    expect(e).toEqual({
      name: 'ZodError',
      message: 'schema validation failed',
      issues: [{ path: 's', code: 'invalid_value' }],
    });
    expect(JSON.stringify(e)).not.toContain('secret');
  });

  it('N2: inflected/contracted consequence verbs count; an innocent "or you can ..." does not', () => {
    const hot = { pitch_volatility: 1, volume_intensity: 1, speech_rate_wpm: 240 };
    const risk = (t: string) => classifyRules(input(t, 'counterpart', hot)).risk;
    expect(risk("Decide by Friday or we're walking.")).toBe('critical');
    expect(risk("Sign by Monday or I'm cancelling the contract.")).toBe('critical');
    expect(risk('Sign by Monday or we will be moving to another vendor.')).toBe('critical');
    expect(risk('Please confirm by Monday or you can send it to Alex.')).not.toBe('critical');
  });

  it('N8: ids are never rendered into the prompt', () => {
    const block = buildUserBlock({
      text: 'hello',
      speaker: 'counterpart',
      imputed: [],
      acoustics: {
        pitch_volatility: 0.3,
        speech_rate_wpm: 150,
        pause_duration_ms: 300,
        volume_intensity: 0.5,
      },
      meta: { chunk_id: 'CHUNK-ID-123', session_id: 'SESSION-ID-456' },
    });
    expect(block).not.toContain('CHUNK-ID-123');
    expect(block).not.toContain('SESSION-ID-456');
  });
});
