import { describe, expect, it } from 'vitest';
import {
  emptyState,
  ingest,
  MAX_OTHER_SESSIONS,
  MAX_PER_SESSION,
  pinSession,
  SESSION_IDLE_MS,
} from '../src/lib/store';
import { item } from './helpers';

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
    expect(s.activeSessionId).toBe('s1');
  });

  it('pin: explicit pinSession wins and counts as activity', () => {
    let s = ingest(emptyState, item('a', 's1', { received_at: 0 }));
    s = pinSession(s, 's2', 50_000);
    expect(s.activeSessionId).toBe('s2');
    // s2 has no items yet but was pinned at 50 s: a s1 frame at 55 s must not take over
    s = ingest(s, item('b', 's1', { received_at: 55_000 }));
    expect(s.activeSessionId).toBe('s2');
  });

  it('interleaved frames from another session do not switch while the shown one is active', () => {
    let s = ingest(emptyState, item('a', 's1', { received_at: 0 }));
    s = ingest(s, item('b', 's2', { received_at: 5_000 }));
    s = ingest(s, item('c', 's1', { received_at: 9_000 }));
    s = ingest(s, item('d', 's2', { received_at: 15_000 }));
    expect(s.activeSessionId).toBe('s1');
  });

  it('a new session takes over once the shown one has been idle >= 10 s', () => {
    let s = ingest(emptyState, item('a', 's1', { received_at: 0 }));
    s = ingest(s, item('b', 's2', { received_at: SESSION_IDLE_MS - 1 }));
    expect(s.activeSessionId).toBe('s1');
    s = ingest(s, item('c', 's2', { received_at: SESSION_IDLE_MS }));
    expect(s.activeSessionId).toBe('s2');
  });

  it('duplicate chunk never switches sessions', () => {
    let s = ingest(emptyState, item('a', 's1', { received_at: 0 }));
    s = ingest(s, item('b', 's2', { received_at: 1 }));
    s = ingest(s, item('b', 's2', { received_at: 60_000 }));
    expect(s.activeSessionId).toBe('s1');
  });

  it('retains the shown session plus at most 5 most-recent others', () => {
    let s = ingest(emptyState, item('a', 's0', { received_at: 0 }));
    for (let i = 1; i <= 8; i++) s = ingest(s, item(`c${i}`, `s${i}`, { received_at: i }));
    const ids = Object.keys(s.sessions);
    expect(ids).toHaveLength(1 + MAX_OTHER_SESSIONS);
    expect(ids).toContain('s0');
    expect(ids).not.toContain('s1');
    expect(ids).toContain('s8');
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
