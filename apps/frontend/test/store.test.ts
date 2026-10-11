import { describe, expect, it } from 'vitest';
import type { TelemetryResponse } from '@app/contracts';
import { emptyState, ingest, MAX_PER_SESSION, type StreamItem } from '../src/lib/store';

const result = (id: string): TelemetryResponse => ({
  chunk_id: id,
  processing_latency_ms: 5,
  sentiment: 'neutral',
  confidence: 0.5,
  volatility_flag: false,
  hidden_intent: 'x',
  mitigation_suggestion: 'y',
  risk_level: 'low',
});
const item = (id: string, session = 's', extra: Partial<StreamItem> = {}): StreamItem => ({
  chunk_id: id,
  session_id: session,
  speaker: null,
  text_excerpt: '',
  timestamp_ms: 1,
  result: result(id),
  ...extra,
});

describe('store', () => {
  it('puts newest first', () => {
    const s = ingest(ingest(emptyState, item('a')), item('b'));
    expect(s.sessions['s']?.map((i) => i.chunk_id)).toEqual(['b', 'a']);
    expect(s.activeSessionId).toBe('s');
  });

  it('dedupe enriches missing fields and keeps order', () => {
    let s = ingest(emptyState, item('a'));
    s = ingest(s, item('b'));
    s = ingest(s, item('a', 's', { speaker: 'candidate', text_excerpt: 'hi' }));
    const list = s.sessions['s'] ?? [];
    expect(list.map((i) => i.chunk_id)).toEqual(['b', 'a']);
    expect(list[1]?.speaker).toBe('candidate');
    expect(list[1]?.text_excerpt).toBe('hi');
  });

  it('does not overwrite an existing speaker on duplicate', () => {
    let s = ingest(emptyState, item('a', 's', { speaker: 'candidate' }));
    s = ingest(s, item('a', 's', { speaker: 'counterpart' }));
    expect(s.sessions['s']?.[0]?.speaker).toBe('candidate');
  });

  it('ring buffer: 201 items keeps 200 and drops the oldest', () => {
    let s = emptyState;
    for (let i = 0; i <= MAX_PER_SESSION; i++) s = ingest(s, item(`c${i}`));
    const list = s.sessions['s'] ?? [];
    expect(list).toHaveLength(MAX_PER_SESSION);
    expect(list[0]?.chunk_id).toBe(`c${MAX_PER_SESSION}`);
    expect(list.some((i) => i.chunk_id === 'c0')).toBe(false);
  });

  it('isolates sessions (same chunk_id in two sessions)', () => {
    let s = ingest(emptyState, item('a', 's1'));
    s = ingest(s, item('a', 's2'));
    expect(s.sessions['s1']).toHaveLength(1);
    expect(s.sessions['s2']).toHaveLength(1);
    expect(s.activeSessionId).toBe('s2');
  });

  it('does not mutate previous state', () => {
    const s1 = ingest(emptyState, item('a'));
    const snapshot = JSON.stringify(s1);
    const list = s1.sessions['s'];
    ingest(s1, item('b'));
    ingest(s1, item('a', 's', { speaker: 'candidate' }));
    expect(JSON.stringify(s1)).toBe(snapshot);
    expect(s1.sessions['s']).toBe(list);
  });
});
