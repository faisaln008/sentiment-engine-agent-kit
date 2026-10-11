import {
  RISK_ORDER,
  type AcousticField,
  type AcousticMetadata,
  type RiskLevel,
  type RiskMoment,
  type Sentiment,
  type Speaker,
} from '@app/contracts';
import type { Baseline } from '../domain/acoustic-baseline.js';
import type { ContextTurn } from '../llm/classifier.js';

export const MAX_RECORDS = 200;
export const MAX_IDS = 5000;

export interface SessionOptions {
  maxSessions: number;
  ttlMs: number;
  contextTurns: number;
  /** Injected clock (ms). */
  now?: () => number;
}

/** What the pipeline hands to commit(). `text` is the trimmed transcript (clipped here, never logged). */
export interface CommitRecord {
  chunk_id: string;
  timestamp_ms: number;
  speaker: Speaker;
  text: string;
  sentiment: Sentiment;
  risk: RiskLevel;
  flagged: boolean;
  acoustics: AcousticMetadata;
  imputed: readonly AcousticField[];
  /** Arousal z at arrival (vs the baseline before this chunk), reused as `prev` for the speaker's next chunk. */
  arousalZ: number;
  /** Blank text: counters only, no context turn, no baseline update. */
  blank: boolean;
}

export interface Stored {
  chunk_id: string;
  timestamp_ms: number;
  speaker: Speaker;
  text: string;
  sentiment: Sentiment;
  arousalZ: number;
}

export interface Snapshot {
  turns: readonly ContextTurn[];
  baselines: Readonly<Record<Speaker, Baseline>>;
  prev: Readonly<Partial<Record<Speaker, { arousalZ: number; sentiment: Sentiment }>>>;
}

export interface SessionCounters {
  chunk_count: number;
  flagged_count: number;
  sentiment_counts: Readonly<Record<Sentiment, number>>;
  /** High/critical moments: risk desc, then most recent first; at most 3. */
  top_risk_moments: readonly RiskMoment[];
}

export interface Session {
  records: Stored[]; // sorted by timestamp_ms, capped at MAX_RECORDS
  baselines: Record<Speaker, Baseline>;
  ids: Set<string>; // FIFO-capped idempotency set
  counters: {
    chunk_count: number;
    flagged_count: number;
    counts: Record<Sentiment, number>;
    top: RiskMoment[];
  };
  warnedSpeaker: boolean;
  lastSeenAt: number;
}

export const zeroCounts = (): Record<Sentiment, number> => ({
  positive: 0,
  negative: 0,
  neutral: 0,
  sarcastic: 0,
  aggressive: 0,
  deflecting: 0,
  appeasement: 0,
});

export function momentOrder(a: RiskMoment, b: RiskMoment): number {
  return RISK_ORDER[b.risk_level] - RISK_ORDER[a.risk_level] || b.timestamp_ms - a.timestamp_ms;
}
