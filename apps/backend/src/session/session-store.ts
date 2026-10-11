import type { Sentiment, Speaker } from '@app/contracts';
import { LIMITS } from '@app/contracts';
import type { ContextTurn } from '../llm/classifier.js';
import { emptyBaseline, observe } from '../domain/acoustic-baseline.js';
import { clipTurn } from '../domain/clip.js';
import { truncate } from '../domain/truncate.js';
import {
  MAX_IDS,
  MAX_RECORDS,
  momentOrder,
  zeroCounts,
  type CommitRecord,
  type Session,
  type SessionCounters,
  type SessionOptions,
  type Snapshot,
  type Stored,
} from './types.js';

export type { CommitRecord, SessionCounters, SessionOptions, Snapshot } from './types.js';

/**
 * In-memory per-session state (ADR-004). Owns ALL mutable per-session state; created once in server.ts.
 * snapshot() and commit() are synchronous. Bounds: LRU `maxSessions`, idle TTL, 200 records, 5000 ids.
 */
export class SessionStore {
  private readonly sessions = new Map<string, Session>(); // insertion order = LRU order
  private timer: NodeJS.Timeout | undefined;
  private readonly now: () => number;

  constructor(private readonly o: SessionOptions) {
    this.now = o.now ?? ((): number => Date.now());
  }

  /** Starts the unref'd TTL sweep (server.ts only; tests drive sweep() directly). */
  start(): void {
    if (this.timer !== undefined) return;
    this.timer = setInterval(
      () => this.sweep(),
      Math.min(60_000, Math.max(1000, this.o.ttlMs / 2)),
    );
    this.timer.unref();
  }

  stop(): void {
    if (this.timer !== undefined) clearInterval(this.timer);
    this.timer = undefined;
  }

  get size(): number {
    return this.sessions.size;
  }

  /** Removes sessions idle longer than the TTL. */
  sweep(): void {
    const cutoff = this.now() - this.o.ttlMs;
    for (const [id, s] of this.sessions) if (s.lastSeenAt < cutoff) this.sessions.delete(id);
  }

  /**
   * Immutable view at arrival. Context and prev are the chunks committed BEFORE this one: strictly earlier
   * timestamps, or equal timestamps committed earlier (ties are broken by arrival order, so constant or
   * same-millisecond timestamps still build context). The baseline is the running stats of everything
   * committed so far, which never includes the chunk being analysed (T9). Unknown session -> empty snapshot
   * (no entry is created). A chunk without `timestamp_ms` passes `beforeMs` undefined and sees everything.
   */
  snapshot(sessionId: string, beforeMs?: number, currentChunkId?: string): Snapshot {
    const s = this.live(sessionId);
    if (s === undefined) {
      return {
        turns: [],
        baselines: { candidate: emptyBaseline(), counterpart: emptyBaseline() },
        prev: {},
      };
    }
    this.touch(sessionId, s);
    const turns: ContextTurn[] = [];
    const prev: Partial<Record<Speaker, { arousalZ: number; sentiment: Sentiment }>> = {};
    for (let i = s.records.length - 1; i >= 0; i--) {
      const r = s.records[i];
      if (r === undefined) continue;
      if (currentChunkId !== undefined && r.chunk_id === currentChunkId) continue; // never its own context
      // Earlier OR equal timestamp counts as committed earlier (arrival order breaks ties).
      if (beforeMs !== undefined && r.timestamp_ms > beforeMs) continue;
      if (turns.length < this.o.contextTurns) {
        turns.unshift({ speaker: r.speaker, sentiment: r.sentiment, text: r.text });
      }
      prev[r.speaker] ??= { arousalZ: r.arousalZ, sentiment: r.sentiment };
      if (turns.length >= this.o.contextTurns && prev.candidate && prev.counterpart) break;
    }
    return { turns, baselines: { ...s.baselines }, prev };
  }

  /**
   * Synchronous commit. Returns false (and changes nothing) for a duplicate chunk_id. Creates the session if
   * needed; ordered insert by timestamp; counters are independent of the 200-record cap.
   */
  commit(sessionId: string, r: CommitRecord): boolean {
    const s = this.getOrCreate(sessionId);
    if (s.ids.has(r.chunk_id)) return false;
    s.ids.add(r.chunk_id);
    if (s.ids.size > MAX_IDS) {
      const oldest = s.ids.values().next().value;
      if (oldest !== undefined) s.ids.delete(oldest);
    }
    this.count(s, r);
    if (!r.blank) this.record(s, r);
    return true;
  }

  /** True once per session: the caller logs the unknown-speaker warn (state is evicted with the session). */
  shouldWarnUnknownSpeaker(sessionId: string): boolean {
    const s = this.getOrCreate(sessionId);
    if (s.warnedSpeaker) return false;
    s.warnedSpeaker = true;
    return true;
  }

  /** Counters for S10; undefined for unknown, expired or evicted sessions (and sessions with no commits). */
  counters(sessionId: string): SessionCounters | undefined {
    const s = this.live(sessionId);
    if (s === undefined || s.counters.chunk_count === 0) return undefined;
    return {
      chunk_count: s.counters.chunk_count,
      flagged_count: s.counters.flagged_count,
      sentiment_counts: { ...s.counters.counts },
      top_risk_moments: [...s.counters.top],
    };
  }

  private count(s: Session, r: CommitRecord): void {
    const c = s.counters;
    c.chunk_count += 1;
    if (r.flagged) c.flagged_count += 1;
    c.counts[r.sentiment] += 1;
    if (r.risk === 'high' || r.risk === 'critical') {
      c.top.push({
        chunk_id: r.chunk_id,
        timestamp_ms: r.timestamp_ms,
        sentiment: r.sentiment,
        risk_level: r.risk,
        text_excerpt: truncate(r.text, LIMITS.TEXT_EXCERPT_MAX),
      });
      c.top.sort(momentOrder);
      c.top.length = Math.min(c.top.length, LIMITS.TOP_RISK_MOMENTS_MAX);
    }
  }

  private record(s: Session, r: CommitRecord): void {
    const b = s.baselines[r.speaker];
    s.baselines[r.speaker] = observe(b, r.acoustics, r.imputed);
    const rec: Stored = {
      chunk_id: r.chunk_id,
      timestamp_ms: r.timestamp_ms,
      speaker: r.speaker,
      text: clipTurn(r.text),
      sentiment: r.sentiment,
      arousalZ: r.arousalZ,
    };
    let i = s.records.length;
    while (i > 0 && (s.records[i - 1]?.timestamp_ms ?? 0) > rec.timestamp_ms) i--;
    s.records.splice(i, 0, rec);
    if (s.records.length > MAX_RECORDS) s.records.shift();
  }

  /** Session if present and not expired (expired ones are dropped lazily). */
  private live(id: string): Session | undefined {
    const s = this.sessions.get(id);
    if (s === undefined) return undefined;
    if (s.lastSeenAt < this.now() - this.o.ttlMs) {
      this.sessions.delete(id);
      return undefined;
    }
    return s;
  }

  private touch(id: string, s: Session): void {
    s.lastSeenAt = this.now();
    this.sessions.delete(id);
    this.sessions.set(id, s);
  }

  private getOrCreate(id: string): Session {
    const existing = this.live(id);
    if (existing !== undefined) {
      this.touch(id, existing);
      return existing;
    }
    const s: Session = {
      records: [],
      baselines: { candidate: emptyBaseline(), counterpart: emptyBaseline() },
      ids: new Set(),
      counters: { chunk_count: 0, flagged_count: 0, counts: zeroCounts(), top: [] },
      warnedSpeaker: false,
      lastSeenAt: this.now(),
    };
    this.sessions.set(id, s);
    while (this.sessions.size > this.o.maxSessions) {
      const oldest = this.sessions.keys().next().value;
      if (oldest === undefined) break;
      this.sessions.delete(oldest);
    }
    return s;
  }
}
