import { request } from 'node:http';
import type { AddressInfo } from 'node:net';
import { describe, expect, it } from 'vitest';
import { TelemetryResponseSchema, type Sentiment } from '@app/contracts';
import { buildApp } from '../src/app.js';
import { loadConfig } from '../src/config.js';
import type { Classifier, ClassifyInput, ClassifyResult } from '../src/llm/classifier.js';
import { SessionStore } from '../src/session/session-store.js';

const headers = { 'content-type': 'application/json' };
const ac = (o: object = {}) => ({
  pitch_volatility: 0.3,
  speech_rate_wpm: 150,
  pause_duration_ms: 300,
  volume_intensity: 0.5,
  ...o,
});
const verdict = (sentiment: Sentiment, c = 0.7): ClassifyResult => ({
  ok: true,
  provider: 'fake',
  ms: 1,
  verdict: { sentiment, confidence: c, hidden_intent: 'x', mitigation: 'y', risk: 'medium' },
});
/** Fake classifier that records inputs and answers by script. */
function spy(answer: (i: ClassifyInput) => ClassifyResult | Promise<ClassifyResult>) {
  const seen: ClassifyInput[] = [];
  const c: Classifier = {
    name: 'fake',
    classify: (i) => {
      seen.push(i);
      return Promise.resolve(answer(i));
    },
  };
  return { c, seen };
}
const make = (c: Classifier, sessions?: SessionStore) =>
  buildApp(loadConfig({ LOG_LEVEL: 'silent' }), {
    classifier: c,
    ...(sessions ? { sessions } : {}),
  });
const post = (a: ReturnType<typeof make>, body: object) =>
  a.inject({
    method: 'POST',
    url: '/api/telemetry/stream',
    headers,
    payload: JSON.stringify(body),
  });

describe('pipeline + session (S5)', () => {
  it('prompt input gets context turns, acoustic descriptors and arousal z from the session', async () => {
    const { c, seen } = spy(() => verdict('negative'));
    const a = make(c);
    await post(a, {
      chunk_id: 'a1',
      session_id: 's',
      speaker: 'counterpart',
      timestamp_ms: 1000,
      text: 'first words',
      acoustic_metadata: ac(),
    });
    await post(a, {
      chunk_id: 'a2',
      session_id: 's',
      speaker: 'candidate',
      timestamp_ms: 2000,
      text: 'second words',
      acoustic_metadata: ac(),
    });
    await post(a, {
      chunk_id: 'a3',
      session_id: 's',
      speaker: 'counterpart',
      timestamp_ms: 3000,
      text: 'third words',
      acoustic_metadata: ac({ speech_rate_wpm: 240 }),
    });
    expect(seen[0]?.context).toEqual([]);
    expect(seen[2]?.context?.map((t) => `${t.speaker}|${t.sentiment}|${t.text}`)).toEqual([
      'counterpart|negative|first words',
      'candidate|negative|second words',
    ]);
    expect(seen[2]?.acousticNote).toContain('pace');
    // T9 at pipeline level: baseline has only chunk 1 (n=1 -> priors). z = (-0.25 + 3 + 0) / 3; ~0.24 if chunk 3 leaked in.
    expect(seen[2]?.arousalZ).toBeCloseTo(0.9167, 2);
  });

  it('volatility flows into the response: calm positive then hot aggressive from the same speaker => flag + critical', async () => {
    const script: Sentiment[] = ['positive', 'aggressive'];
    let k = 0;
    const { c } = spy(() => verdict(script[k++] ?? 'neutral', 0.9));
    const a = make(c);
    const r1 = await post(a, {
      chunk_id: 'v1',
      session_id: 'v',
      speaker: 'counterpart',
      timestamp_ms: 1000,
      text: 'fine',
      acoustic_metadata: ac(),
    });
    expect(TelemetryResponseSchema.parse(r1.json()).volatility_flag).toBe(false);
    const r2 = await post(a, {
      chunk_id: 'v2',
      session_id: 'v',
      speaker: 'counterpart',
      timestamp_ms: 2000,
      text: 'no',
      acoustic_metadata: ac({
        pitch_volatility: 0.95,
        speech_rate_wpm: 240,
        volume_intensity: 0.95,
      }),
    });
    expect(TelemetryResponseSchema.parse(r2.json())).toMatchObject({
      volatility_flag: true,
      risk_level: 'critical',
    });
  });

  it('volatility works with constant timestamps (arrival order breaks ties)', async () => {
    const script: Sentiment[] = ['positive', 'aggressive'];
    let k = 0;
    const { c, seen } = spy(() => verdict(script[k++] ?? 'neutral', 0.9));
    const a = make(c);
    const at = (id: string, text: string, am: object) =>
      post(a, {
        chunk_id: id,
        session_id: 'const-ts',
        speaker: 'counterpart',
        timestamp_ms: 1700000000000,
        text,
        acoustic_metadata: am,
      });
    await at('k1', 'fine', ac());
    const r = await at(
      'k2',
      'no',
      ac({ pitch_volatility: 0.95, speech_rate_wpm: 240, volume_intensity: 0.95 }),
    );
    expect(seen[1]?.context).toHaveLength(1);
    expect(TelemetryResponseSchema.parse(r.json())).toMatchObject({
      volatility_flag: true,
      risk_level: 'critical',
    });
  });

  it('pipeline.client-abort-still-commits: the commit happens even if the client hangs up', async () => {
    const sessions = new SessionStore({ maxSessions: 10, ttlMs: 60_000, contextTurns: 3 });
    let entered: () => void = () => undefined;
    const enteredP = new Promise<void>((r) => (entered = r));
    let release: () => void = () => undefined;
    const gate = new Promise<void>((r) => (release = r));
    const slow: Classifier = {
      name: 'fake',
      classify: async () => {
        entered();
        await gate;
        return verdict('neutral');
      },
    };
    const a = make(slow, sessions);
    await a.listen({ port: 0, host: '127.0.0.1' });
    try {
      const port = (a.server.address() as AddressInfo).port;
      const body = JSON.stringify({ chunk_id: 'ab1', session_id: 'abort', text: 'hello there' });
      const req = request({
        host: '127.0.0.1',
        port,
        path: '/api/telemetry/stream',
        method: 'POST',
        headers: { ...headers, 'content-length': Buffer.byteLength(body) },
      });
      req.on('error', () => undefined);
      req.end(body);
      await enteredP; // the server is inside the classifier
      req.destroy(); // client hangs up mid-request
      expect(sessions.counters('abort')).toBeUndefined();
      release();
      for (let i = 0; i < 200 && sessions.counters('abort') === undefined; i++) {
        await new Promise((r) => setTimeout(r, 10));
      }
      expect(sessions.counters('abort')?.chunk_count).toBe(1);
    } finally {
      await a.close();
    }
  });

  it('session.concurrency-no-bleed: 20 sessions x 10 chunks in parallel, ids echoed, state isolated', async () => {
    const sessions = new SessionStore({ maxSessions: 100, ttlMs: 60_000, contextTurns: 3 });
    const contexts = new Map<string, string[]>();
    const { c } = spy((i) => {
      contexts.set(
        i.text,
        (i.context ?? []).map((t) => t.text),
      );
      return verdict(i.text.endsWith('-0') ? 'positive' : 'negative');
    });
    const a = make(c, sessions);
    const runSession = async (s: number): Promise<void> => {
      for (let k = 0; k < 10; k++) {
        const speaker = k % 2 === 0 ? 'counterpart' : 'candidate';
        const res = await post(a, {
          chunk_id: `s${s}-c${k}`,
          session_id: `s${s}`,
          speaker,
          timestamp_ms: 1000 + k,
          text: `s${s}-${k}`,
          acoustic_metadata: ac({ speech_rate_wpm: 100 + s * 5 }),
        });
        expect(res.json().chunk_id).toBe(`s${s}-c${k}`);
      }
    };
    await Promise.all(Array.from({ length: 20 }, (_, s) => runSession(s)));
    for (let s = 0; s < 20; s++) {
      for (let k = 0; k < 10; k++) {
        const ctx = contexts.get(`s${s}-${k}`) ?? [];
        expect(ctx.every((t) => t.startsWith(`s${s}-`))).toBe(true); // no context from another session
        expect(ctx).toEqual(
          Array.from({ length: Math.min(k, 3) }, (_, j) => `s${s}-${k - Math.min(k, 3) + j}`),
        );
      }
      expect(sessions.counters(`s${s}`)?.chunk_count).toBe(10);
      const base = sessions.snapshot(`s${s}`).baselines.counterpart.speech_rate_wpm;
      expect(base.n).toBe(5);
      expect(base.mean).toBeCloseTo(100 + s * 5, 6); // only this session's pace
    }
    expect(sessions.size).toBe(20);
  });

  it('20 parallel requests to one app echo their own chunk_id', async () => {
    const { c } = spy(() => verdict('neutral'));
    const a = make(c);
    const rs = await Promise.all(
      Array.from({ length: 20 }, (_, i) =>
        post(a, { chunk_id: `p${i}`, session_id: `ps${i % 4}`, text: `text ${i}` }),
      ),
    );
    expect(rs.map((r) => r.json().chunk_id)).toEqual(Array.from({ length: 20 }, (_, i) => `p${i}`));
  });

  it('blank text counts but adds no context', async () => {
    const sessions = new SessionStore({ maxSessions: 10, ttlMs: 60_000, contextTurns: 3 });
    const { c, seen } = spy(() => verdict('neutral'));
    const a = make(c, sessions);
    await post(a, { chunk_id: 'b1', session_id: 'bl', text: '   ' });
    await post(a, { chunk_id: 'b2', session_id: 'bl', text: 'real words' });
    expect(seen).toHaveLength(1);
    expect(seen[0]?.context).toEqual([]);
    expect(sessions.counters('bl')?.chunk_count).toBe(2);
  });
});
