/** Pure eval metrics over labelled rows + per-chunk results (live run or stored baseline). */
import type { Sentiment, TelemetryResponse } from '@app/contracts';
import { bySession, type LabelledChunk } from './dataset.js';
import type { ChunkResult } from './eval-run.js';
import {
  binary,
  classification,
  constantFloor,
  riskMetrics,
  summarize,
  type ClassificationReport,
  type LatencySummary,
  type Prediction,
  type Prf,
  type RiskReport,
} from './stats.js';
import { has, hasPrefix, isNuance } from './validate.js';
import { traceSession } from './volatility-oracle.js';

export interface GroupAcc {
  name: string;
  n: number;
  strict: number;
  lenient: number;
}
export interface PairOutcome {
  id: string;
  kind: string;
  members: { chunk_id: string; expected: Sentiment; got: Sentiment | null; ok: boolean }[];
}
export interface EvalMetrics {
  n: number;
  errors: number;
  cls: ClassificationReport;
  neutralFloor: ClassificationReport;
  nuance: GroupAcc;
  groups: GroupAcc[];
  /** API volatility_flag vs human expected_volatility. */
  detection: Prf & { n: number; agreement: number; positives: number };
  /** API volatility_flag vs ADR-003 oracle replayed over the RETURNED sentiments + dataset acoustics. */
  fidelity: Prf & { n: number; agreement: number; positives: number };
  risk: RiskReport;
  client: LatencySummary;
  server: LatencySummary;
  confCorrect: number;
  confWrong: number;
  pairs: PairOutcome[];
}

const mean = (xs: number[]): number =>
  xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : Number.NaN;

export function groupAcc(
  name: string,
  rows: LabelledChunk[],
  got: Map<string, Sentiment | null>,
): GroupAcc {
  const g = (r: LabelledChunk): Sentiment | null => got.get(r.chunk_id) ?? null;
  const n = rows.length;
  return {
    name,
    n,
    strict: n ? rows.filter((r) => g(r) === r.expected_sentiment).length / n : Number.NaN,
    lenient: n
      ? rows.filter((r) => {
          const x = g(r);
          return x !== null && r.acceptable_sentiments.includes(x);
        }).length / n
      : Number.NaN,
  };
}

const GROUPS: [string, (r: LabelledChunk) => boolean][] = [
  ['speaker: candidate', (r) => r.speaker === 'candidate'],
  ['speaker: counterpart', (r) => r.speaker === 'counterpart'],
  ['acoustic:agree', (r) => has(r, 'acoustic:agree')],
  ['acoustic:contradict', (r) => has(r, 'acoustic:contradict')],
  ['counterfactual', (r) => has(r, 'counterfactual')],
  ['context-flip', (r) => has(r, 'context-flip')],
  ['context-dependent', (r) => has(r, 'context-dependent')],
  ['hard-negative:*', (r) => hasPrefix(r, 'hard-negative:')],
  ['injection', (r) => has(r, 'injection')],
  ['brief-pattern', (r) => has(r, 'brief-pattern')],
  ['sudden-shift', (r) => has(r, 'sudden-shift')],
];

/** All metrics for one run. `results` may come from a live run or a stored baseline (same rows). */
export function computeMetrics(
  rows: readonly LabelledChunk[],
  results: readonly ChunkResult[],
): EvalMetrics {
  const byId = new Map(results.map((x) => [x.chunk_id, x]));
  const resp = (r: LabelledChunk): TelemetryResponse | null =>
    byId.get(r.chunk_id)?.response ?? null;
  const got = new Map(rows.map((r) => [r.chunk_id, resp(r)?.sentiment ?? null]));
  const preds: Prediction[] = rows.map((r) => ({
    expected: r.expected_sentiment,
    acceptable: r.acceptable_sentiments,
    got: got.get(r.chunk_id) ?? null,
  }));
  const oracle = new Map<string, boolean>();
  for (const list of bySession([...rows]).values())
    for (const t of traceSession(list, (c) => resp(c)?.sentiment ?? c.expected_sentiment))
      oracle.set(t.chunk_id, t.flag);
  const answered = rows.filter((r) => resp(r) !== null);
  const conf = (ok: boolean): number =>
    mean(
      answered
        .filter((r) => (resp(r)?.sentiment === r.expected_sentiment) === ok)
        .map((r) => resp(r)?.confidence ?? 0),
    );
  const ok = results.filter((x) => x.response !== null);
  return {
    n: rows.length,
    errors: rows.length - answered.length,
    cls: classification(preds),
    neutralFloor: constantFloor(preds, 'neutral'),
    nuance: groupAcc('nuance subset', rows.filter(isNuance), got),
    groups: GROUPS.map(([name, f]) => groupAcc(name, rows.filter(f), got)),
    detection: binary(
      rows.map((r) => ({ truth: r.expected_volatility, got: resp(r)?.volatility_flag ?? null })),
    ),
    fidelity: binary(
      answered.map((r) => ({
        truth: oracle.get(r.chunk_id) ?? false,
        got: resp(r)?.volatility_flag ?? null,
      })),
    ),
    risk: riskMetrics(
      rows.map((r) => ({
        expected: r.expected_risk,
        got: resp(r)?.risk_level ?? null,
      })),
    ),
    client: summarize(ok.map((x) => x.clientMs)),
    server: summarize(ok.flatMap((x) => (x.response ? [x.response.processing_latency_ms] : []))),
    confCorrect: conf(true),
    confWrong: conf(false),
    pairs: pairOutcomes(rows, got),
  };
}

function pairOutcomes(
  rows: readonly LabelledChunk[],
  got: Map<string, Sentiment | null>,
): PairOutcome[] {
  const pairs = new Map<string, LabelledChunk[]>();
  for (const r of rows) if (r.pair_id) pairs.set(r.pair_id, [...(pairs.get(r.pair_id) ?? []), r]);
  return [...pairs].map(([id, m]) => ({
    id,
    kind: m.every((r) => has(r, 'counterfactual')) ? 'counterfactual' : 'context-flip',
    members: m.map((r) => {
      const g = got.get(r.chunk_id) ?? null;
      return {
        chunk_id: r.chunk_id,
        expected: r.expected_sentiment,
        got: g,
        ok: g === r.expected_sentiment,
      };
    }),
  }));
}

/** Accuracy split by the provider that answered each chunk (from the server log): does quality collapse on fallback? */
export function perProvider(
  rows: readonly LabelledChunk[],
  results: readonly ChunkResult[],
  providerOf: (r: LabelledChunk) => string | null,
): GroupAcc[] {
  const got = new Map(results.map((x) => [x.chunk_id, x.response?.sentiment ?? null]));
  const names = [...new Set(rows.map((r) => providerOf(r) ?? 'not in log'))].sort();
  return names.map((n) =>
    groupAcc(
      `answered by \`${n}\``,
      rows.filter((r) => (providerOf(r) ?? 'not in log') === n),
      got,
    ),
  );
}
