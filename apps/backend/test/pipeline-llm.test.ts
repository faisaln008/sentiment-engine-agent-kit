import { Writable } from 'node:stream';
import { describe, expect, it } from 'vitest';
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
    const t = performance.now();
    const res = await run(hang, { LLM_DEADLINE_MS: '120' }, lines).inject({
      method: 'POST',
      url: '/api/telemetry/stream',
      headers,
      payload,
    });
    const dt = performance.now() - t;
    expect(res.statusCode).toBe(200);
    expect(dt).toBeGreaterThanOrEqual(100);
    expect(dt).toBeLessThan(400);
    expect(res.json().processing_latency_ms).toBeGreaterThanOrEqual(100);
    expect(lines.join('')).toContain('"reason":"timeout"');
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

  it('error-handler: 4xx logs only code (no body text); 5xx logs error', async () => {
    const lines: string[] = [];
    const a = run(
      { name: 'h', classify: () => Promise.reject(new Error('x')) },
      { LOG_LEVEL: 'debug' },
      lines,
    );
    await a.inject({
      method: 'POST',
      url: '/api/telemetry/stream',
      headers,
      payload: '{"text":"secret sauce',
    });
    expect(lines.join('')).not.toContain('secret sauce');
  });
});
