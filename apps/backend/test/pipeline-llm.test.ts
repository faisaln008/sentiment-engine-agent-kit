import { Writable } from 'node:stream';
import { describe, expect, it, vi } from 'vitest';
import { TelemetryResponseSchema } from '@app/contracts';
import { buildApp } from '../src/app.js';
import { loadConfig } from '../src/config.js';
import type { Classifier, ClassifyResult } from '../src/llm/classifier.js';

const payload = JSON.stringify({
  chunk_id: 'c1',
  session_id: 's1',
  speaker: 'counterpart',
  text: 'Our legal team needs to review this before anything else.',
});
const headers = { 'content-type': 'application/json' };
const run = (c: Classifier, env: Record<string, string> = {}, lines: string[] = []) => {
  const logStream = new Writable({
    write(b: Buffer, _e, cb) {
      lines.push(b.toString());
      cb();
    },
  });
  return buildApp(loadConfig({ LOG_LEVEL: 'info', ...env }), { classifier: c, logStream });
};
const fail = (reason: 'timeout' | 'http', finishReason?: string): Classifier => ({
  name: 'groq',
  classify: () =>
    Promise.resolve({
      ok: false,
      reason,
      provider: 'groq',
      ms: 1,
      ...(finishReason ? { finishReason } : {}),
    } as ClassifyResult),
});

describe('pipeline (LLM wiring)', () => {
  it('pipeline.primary-ok uses the verdict and logs provider + finish_reason', async () => {
    const lines: string[] = [];
    const c: Classifier = {
      name: 'groq',
      classify: () =>
        Promise.resolve({
          ok: true,
          provider: 'groq',
          ms: 5,
          finishReason: 'stop',
          verdict: {
            sentiment: 'sarcastic',
            confidence: 0.9,
            hidden_intent: 'x',
            mitigation: 'y',
            risk: 'high',
          },
        }),
    };
    const res = await run(c, {}, lines).inject({
      method: 'POST',
      url: '/api/telemetry/stream',
      headers,
      payload,
    });
    expect(TelemetryResponseSchema.parse(res.json()).sentiment).toBe('sarcastic');
    const log = JSON.parse(lines.find((l) => l.includes('"msg":"chunk"')) ?? '{}') as Record<
      string,
      unknown
    >;
    expect(log).toMatchObject({ provider: 'groq', outcome: 'ok', finish_reason: 'stop' });
    expect(lines.join('')).not.toContain('legal team');
  });

  it('pipeline.llm-failure-falls-back-to-heuristic with reason logged', async () => {
    const lines: string[] = [];
    const res = await run(fail('http', 'length'), {}, lines).inject({
      method: 'POST',
      url: '/api/telemetry/stream',
      headers,
      payload,
    });
    expect(res.statusCode).toBe(200);
    expect(TelemetryResponseSchema.parse(res.json()).sentiment).toBe('deflecting');
    const log = JSON.parse(lines.find((l) => l.includes('"msg":"chunk"')) ?? '{}') as Record<
      string,
      unknown
    >;
    expect(log).toMatchObject({
      provider: 'heuristic',
      outcome: 'fallback',
      reason: 'http',
      finish_reason: 'length',
    });
  });

  it('pipeline.deadline-from-t0: a classifier that ignores the signal still yields heuristic at the deadline', async () => {
    const hang: Classifier = { name: 'groq', classify: () => new Promise(() => undefined) };
    const lines: string[] = [];
    vi.useFakeTimers();
    try {
      const pending = run(hang, { LLM_DEADLINE_MS: '120' }, lines).inject({
        method: 'POST',
        url: '/api/telemetry/stream',
        headers,
        payload,
      });
      await vi.advanceTimersByTimeAsync(119);
      let settled = false;
      void pending.then(() => (settled = true));
      await vi.advanceTimersByTimeAsync(0);
      expect(settled).toBe(false); // not before the deadline
      await vi.advanceTimersByTimeAsync(5);
      const res = await pending;
      expect(res.statusCode).toBe(200);
      expect(TelemetryResponseSchema.parse(res.json()).sentiment).toBe('deflecting');
      expect(lines.join('')).toContain('"reason":"timeout"');
    } finally {
      vi.useRealTimers();
    }
  });

  it('pipeline.classifier-signal-aborts-at-deadline', async () => {
    let aborted = false;
    const c: Classifier = {
      name: 'groq',
      classify: (_i, signal) =>
        new Promise((resolve) => {
          signal.addEventListener('abort', () => {
            aborted = true;
            resolve({ ok: false, reason: 'timeout', provider: 'groq', ms: 0 });
          });
        }),
    };
    await run(c, { LLM_DEADLINE_MS: '80' }).inject({
      method: 'POST',
      url: '/api/telemetry/stream',
      headers,
      payload,
    });
    expect(aborted).toBe(true);
  });

  it('pipeline.exception-logged: swallowed throw logs name/message at error, never text', async () => {
    const lines: string[] = [];
    const boom: Classifier = { name: 'boom', classify: () => Promise.reject(new Error('kaboom')) };
    const res = await run(boom, {}, lines).inject({
      method: 'POST',
      url: '/api/telemetry/stream',
      headers,
      payload,
    });
    expect(res.statusCode).toBe(200);
    const err = lines.find((l) => l.includes('swallowed')) ?? '';
    expect(err).toContain('"level":50');
    expect(err).toContain('kaboom');
    expect(lines.join('')).not.toContain('legal team');
  });

  it('pipeline.exception-falls-back: sync throw and rejection => heuristic 200 with ids in the error log', async () => {
    for (const make of [
      (): Classifier => ({
        name: 'sync',
        classify: () => {
          throw new Error('sync-boom');
        },
      }),
      (): Classifier => ({
        name: 'async',
        classify: () => Promise.reject(new TypeError('async-boom')),
      }),
    ]) {
      const lines: string[] = [];
      const res = await run(make(), {}, lines).inject({
        method: 'POST',
        url: '/api/telemetry/stream',
        headers,
        payload,
      });
      expect(res.statusCode).toBe(200);
      expect(TelemetryResponseSchema.parse(res.json()).sentiment).toBe('deflecting'); // heuristic, not neutral
      const err = JSON.parse(lines.find((l) => l.includes('swallowed')) ?? '{}') as Record<
        string,
        unknown
      >;
      expect(err).toMatchObject({ level: 50, chunk_id: 'c1', session_id: 's1' });
      const chunk = JSON.parse(lines.find((l) => l.includes('"msg":"chunk"')) ?? '{}') as Record<
        string,
        unknown
      >;
      expect(chunk).toMatchObject({
        provider: 'heuristic',
        outcome: 'fallback',
        reason: 'exception',
      });
    }
  });

  it('error-handler: 4xx logs only the error code (no body text); 5xx logs at error', async () => {
    const lines: string[] = [];
    const a = run(
      { name: 'h', classify: () => Promise.reject(new Error('x')) },
      { LOG_LEVEL: 'debug' },
      lines,
    );
    a.get('/boom', () => {
      throw new Error('kaboom-5xx');
    });
    const bad = await a.inject({
      method: 'POST',
      url: '/api/telemetry/stream',
      headers,
      payload: '{"text":"secret sauce',
    });
    expect(bad.statusCode).toBe(400);
    const client = lines.find((l) => l.includes('client error')) ?? '';
    expect(client).toMatch(/"code":"FST_ERR_/);
    expect(lines.join('')).not.toContain('secret sauce');
    const boom = await a.inject({ method: 'GET', url: '/boom' });
    expect(boom.statusCode).toBe(500);
    expect(boom.json()).toEqual({ error: 'internal_error' });
    const five = JSON.parse(lines.find((l) => l.includes('unhandled error')) ?? '{}') as Record<
      string,
      unknown
    >;
    expect(five).toMatchObject({ level: 50 });
    expect(JSON.stringify(five)).toContain('kaboom-5xx');
  });
});
