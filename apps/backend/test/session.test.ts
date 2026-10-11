import { describe, expect, it } from 'vitest';
import type { Sentiment, Speaker, RiskLevel } from '@app/contracts';
import { SessionStore, type CommitRecord } from '../src/session/session-store.js';

const AC = {
  pitch_volatility: 0.3,
  speech_rate_wpm: 150,
  pause_duration_ms: 300,
  volume_intensity: 0.5,
};
let n = 0;
const rec = (o: Partial<CommitRecord> = {}): CommitRecord => ({
  chunk_id: `c${++n}`,
  timestamp_ms: 1000 + n,
  speaker: 'counterpart' as Speaker,
  text: 'hello there',
  sentiment: 'neutral' as Sentiment,
  risk: 'low' as RiskLevel,
  flagged: false,
  acoustics: AC,
  imputed: [],
  arousalZ: 0,
  blank: false,
  ...o,
});
const store = (o: Partial<ConstructorParameters<typeof SessionStore>[0]> = {}, now = () => 0) =>
  new SessionStore({ maxSessions: 1000, ttlMs: 1_800_000, contextTurns: 3, now, ...o });

describe('session', () => {
  it('session.auto-create: unknown session -> empty snapshot, no entry; commit creates it', () => {
    const s = store();
    expect(s.snapshot('x').turns).toEqual([]);
    expect(s.size).toBe(0);
    expect(s.counters('x')).toBeUndefined();
    s.commit('x', rec());
    expect(s.size).toBe(1);
    expect(s.counters('x')?.chunk_count).toBe(1);
  });

  it('session.out-of-order-commit: ordered by timestamp; context and prev honour the snapshot time', () => {
    const s = store();
    s.commit(
      'a',
      rec({ chunk_id: 'late', timestamp_ms: 3000, text: 'third', sentiment: 'negative' }),
    );
    s.commit(
      'a',
      rec({ chunk_id: 'early', timestamp_ms: 1000, text: 'first', sentiment: 'positive' }),
    );
    s.commit(
      'a',
      rec({
        chunk_id: 'mid',
        timestamp_ms: 2000,
        text: 'second',
        speaker: 'candidate',
        sentiment: 'neutral',
      }),
    );
    expect(s.snapshot('a').turns.map((t) => t.text)).toEqual(['first', 'second', 'third']);
    const before = s.snapshot('a', 2500);
    expect(before.turns.map((t) => t.text)).toEqual(['first', 'second']);
    expect(before.prev.counterpart?.sentiment).toBe('positive');
    expect(before.prev.candidate?.sentiment).toBe('neutral');
  });

  it('session.duplicate-idempotent: same chunk_id is not committed twice', () => {
    const s = store();
    expect(s.commit('a', rec({ chunk_id: 'dup', flagged: true }))).toBe(true);
    expect(s.commit('a', rec({ chunk_id: 'dup', flagged: true }))).toBe(false);
    const c = s.counters('a');
    expect(c?.chunk_count).toBe(1);
    expect(c?.flagged_count).toBe(1);
    expect(s.snapshot('a').baselines.counterpart.speech_rate_wpm.n).toBe(1);
  });

  it('session.lru-evicts: oldest-touched session goes when maxSessions is exceeded', () => {
    const s = store({ maxSessions: 2 });
    s.commit('a', rec());
    s.commit('b', rec());
    s.snapshot('a'); // touch a: b is now the oldest
    s.commit('c', rec());
    expect(s.counters('b')).toBeUndefined();
    expect(s.counters('a')).toBeDefined();
    expect(s.counters('c')).toBeDefined();
  });

  it('session.ttl: idle sessions expire lazily and by sweep()', () => {
    let t = 0;
    const s = store({ ttlMs: 1000 }, () => t);
    s.commit('a', rec());
    s.commit('b', rec());
    t = 1500;
    s.sweep();
    expect(s.size).toBe(0);
    s.commit('c', rec());
    t = 3000;
    expect(s.counters('c')).toBeUndefined(); // lazy expiry on access
  });

  it('session.blank-text: counters only, no context turn, no baseline update', () => {
    const s = store();
    s.commit('a', rec({ blank: true, text: '   ', acoustics: { ...AC, speech_rate_wpm: 300 } }));
    expect(s.counters('a')?.chunk_count).toBe(1);
    const snap = s.snapshot('a');
    expect(snap.turns).toEqual([]);
    expect(snap.baselines.counterpart.speech_rate_wpm.n).toBe(0);
  });

  it('session.snapshot-excludes-current (T9): baseline only has previously committed chunks', () => {
    const s = store();
    expect(s.snapshot('a').baselines.counterpart.speech_rate_wpm.n).toBe(0); // snapshot before commit
    s.commit('a', rec({ acoustics: { ...AC, speech_rate_wpm: 200 } }));
    const snap = s.snapshot('a');
    expect(snap.baselines.counterpart.speech_rate_wpm.n).toBe(1);
    s.commit('a', rec({ acoustics: { ...AC, speech_rate_wpm: 100 } }));
    expect(snap.baselines.counterpart.speech_rate_wpm.n).toBe(1); // earlier snapshot is immutable
    expect(s.snapshot('a').baselines.counterpart.speech_rate_wpm.n).toBe(2);
  });

  it('session.counters-independent-of-record-cap + bounded top-3 high/critical (risk desc, recent first)', () => {
    const s = store();
    for (let i = 0; i < 250; i++)
      s.commit(
        'a',
        rec({ flagged: i % 2 === 0, sentiment: i % 5 === 0 ? 'aggressive' : 'neutral' }),
      );
    const c = s.counters('a');
    expect(c?.chunk_count).toBe(250);
    expect(c?.flagged_count).toBe(125);
    expect(c?.sentiment_counts.aggressive).toBe(50);
    const t = store();
    t.commit('a', rec({ chunk_id: 'h1', timestamp_ms: 10, risk: 'high' }));
    t.commit('a', rec({ chunk_id: 'k1', timestamp_ms: 5, risk: 'critical' }));
    t.commit('a', rec({ chunk_id: 'h2', timestamp_ms: 20, risk: 'high' }));
    t.commit('a', rec({ chunk_id: 'h3', timestamp_ms: 30, risk: 'high', text: 'x'.repeat(200) }));
    t.commit('a', rec({ chunk_id: 'm', timestamp_ms: 40, risk: 'medium' }));
    const top = t.counters('a')?.top_risk_moments ?? [];
    expect(top.map((m) => m.chunk_id)).toEqual(['k1', 'h3', 'h2']);
    expect(top[1]?.text_excerpt.length).toBeLessThanOrEqual(80);
  });

  it('session.record-cap: history capped at 200 records, context still the latest', () => {
    const s = store({ contextTurns: 3 });
    for (let i = 0; i < 230; i++) s.commit('a', rec({ text: `t${i}` }));
    expect(s.snapshot('a').turns.map((t) => t.text)).toEqual(['t227', 't228', 't229']);
  });

  it('session.context turns are clipped to 40 words', () => {
    const s = store();
    s.commit('a', rec({ text: Array.from({ length: 60 }, (_, i) => `w${i}`).join(' ') }));
    expect(s.snapshot('a').turns[0]?.text.split(' ')).toHaveLength(40);
  });

  it('session.unknown-speaker warned set lives in the session and is evicted with it (T4)', () => {
    const s = store({ maxSessions: 1 });
    expect(s.shouldWarnUnknownSpeaker('a')).toBe(true);
    expect(s.shouldWarnUnknownSpeaker('a')).toBe(false);
    expect(s.shouldWarnUnknownSpeaker('b')).toBe(true); // evicts a
    expect(s.shouldWarnUnknownSpeaker('a')).toBe(true); // a is new again
  });

  it('session.equal-timestamps-keep-context: ties are ordered by arrival', () => {
    const s = store();
    s.commit('a', rec({ chunk_id: 't1', timestamp_ms: 5000, text: 'one', sentiment: 'positive' }));
    s.commit(
      'a',
      rec({
        chunk_id: 't2',
        timestamp_ms: 5000,
        text: 'two',
        sentiment: 'negative',
        speaker: 'candidate',
      }),
    );
    const snap = s.snapshot('a', 5000, 't3');
    expect(snap.turns.map((t) => t.text)).toEqual(['one', 'two']);
    expect(snap.prev.counterpart?.sentiment).toBe('positive');
    expect(snap.prev.candidate?.sentiment).toBe('negative');
    // a re-analysed duplicate does not see itself
    expect(s.snapshot('a', 5000, 't2').turns.map((t) => t.text)).toEqual(['one']);
    // strictly later chunks stay invisible
    expect(s.snapshot('a', 4000, 't0').turns).toEqual([]);
  });

  it('session.context turn is also capped at 240 chars', () => {
    const s = store();
    s.commit('a', rec({ text: 'y'.repeat(5000) }));
    expect(s.snapshot('a').turns[0]?.text.length).toBeLessThanOrEqual(240);
  });

  it('session.snapshot skips its own chunk_id even without a timestamp (T18)', () => {
    const s = store();
    s.commit('a', rec({ chunk_id: 'same', text: 'one' }));
    s.commit('a', rec({ chunk_id: 'other', text: 'two' }));
    expect(s.snapshot('a', undefined, 'same').turns.map((t) => t.text)).toEqual(['two']);
  });
});
