import { describe, expect, it } from 'vitest';
import { SessionSummarySchema, type Sentiment } from '@app/contracts';
import { buildApp } from '../src/app.js';
import { loadConfig } from '../src/config.js';
import type { Classifier } from '../src/llm/classifier.js';

const headers = { 'content-type': 'application/json' };
/** Fake classifier answering by a keyword in the text. */
const fake: Classifier = {
  name: 'fake',
  classify: (i) => {
    const sentiment =
      (['aggressive', 'sarcastic', 'positive', 'negative', 'neutral'] as const).find((s) =>
        i.text.includes(s),
      ) ?? 'neutral';
    const risk = i.text.includes('crit') ? 'critical' : i.text.includes('high') ? 'high' : 'low';
    return Promise.resolve({
      ok: true,
      provider: 'fake',
      ms: 1,
      verdict: {
        sentiment: sentiment as Sentiment,
        confidence: 0.7,
        hidden_intent: 'x',
        mitigation: 'y',
        risk,
      },
    });
  },
};
const app = () => buildApp(loadConfig({ LOG_LEVEL: 'silent' }), { classifier: fake });
const post = (a: ReturnType<typeof app>, body: object) =>
  a.inject({
    method: 'POST',
    url: '/api/telemetry/stream',
    headers,
    payload: JSON.stringify(body),
  });
const get = (a: ReturnType<typeof app>, id: string) =>
  a.inject({ method: 'GET', url: `/api/telemetry/session/${encodeURIComponent(id)}/summary` });

describe('summary (S10)', () => {
  it('summary.unknown-404', async () => {
    const a = app();
    const r = await get(a, 'nope');
    expect(r.statusCode).toBe(404);
    expect(r.json()).toEqual({ error: 'session_not_found' });
  });

  it('counts, volatility fraction (2dp), top moments and real excerpts', async () => {
    const a = app();
    const t = 1000;
    await post(a, {
      chunk_id: 'a',
      session_id: 's',
      speaker: 'counterpart',
      timestamp_ms: t,
      text: 'positive and calm words here',
      acoustic_metadata: { pitch_volatility: 0.1, speech_rate_wpm: 150, volume_intensity: 0.5 },
    });
    await post(a, {
      chunk_id: 'b',
      session_id: 's',
      speaker: 'counterpart',
      timestamp_ms: t + 1,
      text: 'aggressive crit outburst',
      acoustic_metadata: { pitch_volatility: 0.95, speech_rate_wpm: 240, volume_intensity: 0.95 },
    });
    await post(a, {
      chunk_id: 'c',
      session_id: 's',
      speaker: 'candidate',
      timestamp_ms: t + 2,
      text: 'negative high pushback ' + 'word '.repeat(40),
    });
    await post(a, {
      chunk_id: 'd',
      session_id: 's',
      speaker: 'candidate',
      timestamp_ms: t + 3,
      text: 'neutral note',
    });
    const r = await get(a, 's');
    expect(r.statusCode).toBe(200);
    const s = SessionSummarySchema.parse(r.json());
    expect(s).toMatchObject({ session_id: 's', chunk_count: 4, aggregated_volatility_score: 0.25 });
    expect(s.top_risk_moments.map((m) => [m.chunk_id, m.risk_level])).toEqual([
      ['b', 'critical'],
      ['c', 'high'],
    ]);
    expect(s.top_risk_moments[0]?.text_excerpt).toBe('aggressive crit outburst');
    expect(s.top_risk_moments[1]?.text_excerpt.length).toBeLessThanOrEqual(80);
    expect(s.top_risk_moments[1]?.text_excerpt).toMatch(/^negative high pushback word/);
  });

  it('summary.duplicate-not-double-counted', async () => {
    const a = app();
    const body = { chunk_id: 'dup', session_id: 'd', text: 'neutral text' };
    await post(a, body);
    await post(a, body);
    expect((await get(a, 'd')).json().chunk_count).toBe(1);
  });

  it('summary.dominant-tie-break: equal counts resolve by taxonomy order; empty top list is []', async () => {
    const a = app();
    await post(a, { chunk_id: '1', session_id: 't', text: 'positive one' });
    await post(a, { chunk_id: '2', session_id: 't', text: 'sarcastic two' });
    await post(a, { chunk_id: '3', session_id: 't', text: 'neutral three' });
    const s = (await get(a, 't')).json();
    expect(s.dominant_sentiment).toBe('sarcastic');
    expect(s.top_risk_moments).toEqual([]);
    await post(a, { chunk_id: '4', session_id: 'u', text: 'positive a' });
    await post(a, { chunk_id: '5', session_id: 'u', text: 'neutral b' });
    expect((await get(a, 'u')).json().dominant_sentiment).toBe('positive');
  });

  it('summary.evicted-404 and blank chunks count', async () => {
    const a = buildApp(loadConfig({ LOG_LEVEL: 'silent', MAX_SESSIONS: '1' }), {
      classifier: fake,
    });
    await post(a, { chunk_id: '1', session_id: 'first', text: '   ' });
    expect((await get(a, 'first')).json().chunk_count).toBe(1);
    await post(a, { chunk_id: '2', session_id: 'second', text: 'neutral' });
    expect((await get(a, 'first')).statusCode).toBe(404);
  });

  it('summary.long-and-non-ascii-ids (maxParamLength): 512-char and unicode session ids round-trip', async () => {
    const a = app();
    for (const id of [
      'a'.repeat(512),
      'sesi\u00f3n-\u{1F600}-\u4F1A\u8BDD',
      '\u4F1A'.repeat(300),
    ]) {
      await post(a, { chunk_id: 'x1', session_id: id, text: 'neutral hello' });
      const r = await get(a, id);
      expect(r.statusCode).toBe(200);
      expect(r.json().session_id).toBe(id);
    }
  });
});
