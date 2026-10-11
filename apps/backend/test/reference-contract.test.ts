import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { TelemetryResponseSchema, TelemetryRequestWireSchema } from '@app/contracts';
import { buildApp } from '../src/app.js';
import { loadConfig } from '../src/config.js';
import type { Classifier } from '../src/llm/classifier.js';

// Key sets copied from the reference backend's index.js (analyzeChunk return value and GET /health);
// docs/assignment/ is git-ignored, so tests never read it.
const REFERENCE_RESPONSE_KEYS = [
  'chunk_id',
  'processing_latency_ms',
  'sentiment',
  'confidence',
  'volatility_flag',
  'hidden_intent',
  'mitigation_suggestion',
  'risk_level',
];
const REFERENCE_HEALTH_KEYS = ['status', 'mode', 'version', 'timestamp'];

const sample: unknown = JSON.parse(
  readFileSync(new URL('../eval/fixtures/sample-chunk.json', import.meta.url), 'utf8'),
);
const app = buildApp(loadConfig({ LOG_LEVEL: 'silent' }));
const post = (app_: typeof app, payload: unknown) =>
  app_.inject({
    method: 'POST',
    url: '/api/telemetry/stream',
    headers: { 'content-type': 'application/json' },
    payload: JSON.stringify(payload),
  });

describe('reference contract', () => {
  it('sample request shape -> 200 + schema-valid (shape only, not the label)', async () => {
    TelemetryRequestWireSchema.parse(sample);
    const res = await post(app, sample);
    expect(res.statusCode).toBe(200);
    TelemetryResponseSchema.parse(res.json());
  });

  it('our response and /health keys are a superset of the reference keys', async () => {
    const body = (await post(app, sample)).json() as Record<string, unknown>;
    for (const k of REFERENCE_RESPONSE_KEYS) expect(Object.keys(body)).toContain(k);
    const h = (await app.inject({ url: '/health' })).json() as Record<string, unknown>;
    for (const k of REFERENCE_HEALTH_KEYS) expect(Object.keys(h)).toContain(k);
  });
});

describe('boot / pipeline', () => {
  it('boot.no-keys.serves-heuristic', async () => {
    const a = buildApp(loadConfig({ LOG_LEVEL: 'silent' }));
    const h = (await a.inject({ url: '/health' })).json();
    expect(h.mode).toBe('heuristic');
    const res = await post(a, { ...(sample as object), text: 'Take it or leave it, final offer.' });
    expect(res.statusCode).toBe(200);
    expect(res.json().sentiment).toBe('aggressive');
  });

  const spy = (): { c: Classifier; calls: () => number } => {
    let n = 0;
    return {
      c: {
        name: 'spy',
        classify: () => {
          n++;
          return Promise.reject(new Error('must not be called'));
        },
      },
      calls: () => n,
    };
  };

  it('pipeline.empty-text-neutral', async () => {
    const s = spy();
    const a = buildApp(loadConfig({ LOG_LEVEL: 'silent' }), { classifier: s.c });
    const res = await post(a, { ...(sample as object), text: '' });
    expect(res.statusCode).toBe(200);
    expect(res.json().sentiment).toBe('neutral');
    expect(s.calls()).toBe(0);
  });

  it('pipeline.whitespace-text-neutral', async () => {
    const s = spy();
    const a = buildApp(loadConfig({ LOG_LEVEL: 'silent' }), { classifier: s.c });
    for (const text of ['   ', '\n\t']) {
      const res = await post(a, { ...(sample as object), text });
      expect(res.statusCode).toBe(200);
      expect(res.json().sentiment).toBe('neutral');
    }
    expect(s.calls()).toBe(0);
  });
});
