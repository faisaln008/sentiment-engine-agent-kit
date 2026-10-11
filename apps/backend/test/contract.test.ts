import { Writable } from 'node:stream';
import { describe, expect, it } from 'vitest';
import { HealthSchema, OUR_HEALTH_MODE_RE, TelemetryResponseSchema } from '@app/contracts';
import { buildApp } from '../src/app.js';
import { loadConfig } from '../src/config.js';
import type { Classifier } from '../src/llm/classifier.js';

const app = buildApp(loadConfig({ LOG_LEVEL: 'silent' }));
const base = {
  chunk_id: 'c1',
  session_id: 's1',
  timestamp_ms: 1760000000000,
  speaker: 'counterpart',
  text: 'We can look at pricing next quarter.',
  acoustic_metadata: {
    pitch_volatility: 0.35,
    speech_rate_wpm: 128,
    pause_duration_ms: 1200,
    volume_intensity: 0.42,
  },
};
const post = (payload: unknown, raw = false) =>
  app.inject({
    method: 'POST',
    url: '/api/telemetry/stream',
    headers: { 'content-type': 'application/json' },
    payload: raw ? (payload as string) : JSON.stringify(payload),
  });

describe('GET /health', () => {
  it('matches the health shape and our mode regex', async () => {
    const res = await app.inject({ url: '/health' });
    const body = HealthSchema.parse(res.json());
    expect(body.mode).toMatch(OUR_HEALTH_MODE_RE);
    expect(Number.isInteger(body.timestamp)).toBe(true);
  });
});

describe('POST /api/telemetry/stream', () => {
  it('returns a schema-valid 8-key response', async () => {
    const res = await post(base);
    expect(res.statusCode).toBe(200);
    const body = TelemetryResponseSchema.parse(res.json());
    expect(body.chunk_id).toBe('c1');
  });

  it('contract.missing-text-400: no text echo, joined path', async () => {
    const res = await post({ ...base, text: undefined });
    expect(res.statusCode).toBe(400);
    expect(res.json().error).toBe('invalid_request');
    expect(res.json().issues[0].path).toBe('text');
    const bad = await post({ ...base, text: 'SECRET-NEGOTIATION', chunk_id: 5 });
    expect(bad.statusCode).toBe(400);
    expect(bad.body).not.toContain('SECRET-NEGOTIATION');
  });

  it('contract.malformed-body-400 (malformed, empty, null, array)', async () => {
    for (const p of ['{not json', '', 'null', '[]']) {
      const res = await post(p, true);
      expect(res.statusCode).toBe(400);
      expect(res.json().error).toBe('invalid_request');
    }
  });

  it('contract.missing-acoustics-200 (missing, partial, garbage)', async () => {
    for (const am of [undefined, null, 'x', {}, { pitch_volatility: 7, speech_rate_wpm: 'fast' }]) {
      const res = await post({ ...base, acoustic_metadata: am });
      expect(res.statusCode).toBe(200);
      TelemetryResponseSchema.parse(res.json());
    }
  });

  it('contract.unknown-speaker: 200 + one warn per session reading the raw value', async () => {
    const lines: string[] = [];
    const logStream = new Writable({
      write(chunk: Buffer, _enc, cb) {
        lines.push(chunk.toString());
        cb();
      },
    });
    const a = buildApp(loadConfig({ LOG_LEVEL: 'warn', LLM_PRIMARY_API_KEY: 'k' }), { logStream });
    const send = (speaker: unknown) =>
      a.inject({
        method: 'POST',
        url: '/api/telemetry/stream',
        headers: { 'content-type': 'application/json' },
        payload: JSON.stringify({ ...base, speaker }),
      });
    expect((await send('robot')).statusCode).toBe(200);
    expect((await send('robot')).statusCode).toBe(200);
    expect((await send('Candidate')).statusCode).toBe(200);
    expect((await send('counterpart')).statusCode).toBe(200);
    const warns = lines.filter((l) => l.includes('unknown or missing speaker'));
    expect(warns).toHaveLength(1);
    expect(lines.join('')).not.toContain(base.text);
  });

  it('non-JSON content type -> 400 invalid_request', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/telemetry/stream',
      headers: { 'content-type': 'application/x-www-form-urlencoded' },
      payload: 'text=hello',
    });
    expect(res.statusCode).toBe(400);
    expect(res.json().error).toBe('invalid_request');
  });

  it('contract.body-too-large-413', async () => {
    const res = await post({ ...base, text: 'x'.repeat(33 * 1024) });
    expect(res.statusCode).toBe(413);
  });

  it('contract.bad-timestamp-200', async () => {
    for (const ts of [1e20, 'abc', -5, null]) {
      expect((await post({ ...base, timestamp_ms: ts })).statusCode).toBe(200);
    }
  });

  it('contract.zod4-missing-keys-200', async () => {
    const res = await post({ chunk_id: 'k1', session_id: 's', text: 'hello there' });
    expect(res.statusCode).toBe(200);
    expect(res.json().chunk_id).toBe('k1');
  });

  it('contract.id-length-512', async () => {
    const id = 'a'.repeat(512);
    const ok = await post({ ...base, chunk_id: id, session_id: id });
    expect(ok.statusCode).toBe(200);
    expect(ok.json().chunk_id).toBe(id);
    const bad = await post({ ...base, chunk_id: 'a'.repeat(513) });
    expect(bad.statusCode).toBe(400);
    expect((await post({ ...base, session_id: 'b'.repeat(513) })).statusCode).toBe(400);
  });

  it('empty and whitespace-only text -> 200 neutral without calling the classifier', async () => {
    let calls = 0;
    const classifier: Classifier = {
      name: 'fake',
      classify: () => {
        calls++;
        return Promise.reject(new Error('should not be called'));
      },
    };
    const a = buildApp(loadConfig({ LOG_LEVEL: 'silent' }), { classifier });
    for (const text of ['', '   ', '\n\t']) {
      const res = await a.inject({
        method: 'POST',
        url: '/api/telemetry/stream',
        headers: { 'content-type': 'application/json' },
        payload: JSON.stringify({ ...base, text }),
      });
      expect(res.statusCode).toBe(200);
      expect(res.json().sentiment).toBe('neutral');
    }
    expect(calls).toBe(0);
  });

  it('contract.truncates-61-121 and survives a throwing classifier', async () => {
    const longIntent = 'deflection_via_legal_delay_and_procurement_alignment_loops_xy_zz';
    const longMitigation =
      'Propose a joint legal review with a fixed date this week and name an owner for each open item right now please, thanks very much';
    expect(longIntent.length).toBeGreaterThanOrEqual(61);
    expect(longMitigation.length).toBeGreaterThanOrEqual(121);
    const long: Classifier = {
      name: 'fake',
      classify: () =>
        Promise.resolve({
          ok: true as const,
          provider: 'fake',
          ms: 1,
          verdict: {
            sentiment: 'deflecting' as const,
            confidence: 0.777,
            hidden_intent: longIntent,
            mitigation: longMitigation,
            risk: 'high' as const,
          },
        }),
    };
    const a = buildApp(loadConfig({ LOG_LEVEL: 'silent' }), { classifier: long });
    const res = await a.inject({
      method: 'POST',
      url: '/api/telemetry/stream',
      headers: { 'content-type': 'application/json' },
      payload: JSON.stringify(base),
    });
    const b = TelemetryResponseSchema.parse(res.json());
    expect(b.hidden_intent).toBe('deflection_via_legal_delay_and_procurement_alignment_loops');
    expect(b.mitigation_suggestion).toBe(
      'Propose a joint legal review with a fixed date this week and name an owner for each open item right now please, thanks',
    );
    expect(b.mitigation_suggestion).not.toContain('…');
    expect(b.confidence).toBe(0.78);

    const boom: Classifier = { name: 'boom', classify: () => Promise.reject(new Error('x')) };
    const c = buildApp(loadConfig({ LOG_LEVEL: 'silent' }), { classifier: boom });
    const r2 = await c.inject({
      method: 'POST',
      url: '/api/telemetry/stream',
      headers: { 'content-type': 'application/json' },
      payload: JSON.stringify(base),
    });
    expect(r2.statusCode).toBe(200);
  });
});
