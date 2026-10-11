/** Pure metric helpers for run-eval.ts and bench.ts. No I/O. */
import { RISK_ORDER, SENTIMENTS, type RiskLevel, type Sentiment } from '@app/contracts';

/** Nearest-rank percentile (p in (0,100]) of an unsorted sample; NaN on empty input. */
export function percentile(xs: readonly number[], p: number): number {
  if (xs.length === 0) return Number.NaN;
  const s = [...xs].sort((a, b) => a - b);
  const rank = Math.ceil((p / 100) * s.length);
  return s[Math.min(s.length, Math.max(1, rank)) - 1] ?? Number.NaN;
}

export interface LatencySummary {
  n: number;
  p50: number;
  p95: number;
  p99: number;
  max: number;
  mean: number;
}
export function summarize(xs: readonly number[]): LatencySummary {
  const n = xs.length;
  return {
    n,
    p50: percentile(xs, 50),
    p95: percentile(xs, 95),
    p99: percentile(xs, 99),
    max: n ? Math.max(...xs) : Number.NaN,
    mean: n ? xs.reduce((a, b) => a + b, 0) / n : Number.NaN,
  };
}

export interface Prf {
  tp: number;
  fp: number;
  fn: number;
  precision: number;
  recall: number;
  f1: number;
}
/** P/R/F1 with 0 for undefined ratios (0/0) — conservative, and stated in every report. */
export function prf(tp: number, fp: number, fn: number): Prf {
  const precision = tp + fp ? tp / (tp + fp) : 0;
  const recall = tp + fn ? tp / (tp + fn) : 0;
  const f1 = precision + recall ? (2 * precision * recall) / (precision + recall) : 0;
  return { tp, fp, fn, precision, recall, f1 };
}

/** Prediction is null when the request failed or the response was schema-invalid (always counted wrong). */
export interface Prediction {
  expected: Sentiment;
  acceptable: readonly Sentiment[];
  got: Sentiment | null;
}

export interface ClassMetrics extends Prf {
  label: Sentiment;
  support: number;
  predicted: number;
}
export interface ClassificationReport {
  n: number;
  strict: number;
  lenient: number;
  macroF1: number;
  /** Classes in the macro average: support > 0 or predicted > 0 in this run. */
  macroClasses: number;
  perClass: ClassMetrics[];
  /** confusion[expected][got]; `error` column counts null predictions. */
  confusion: Record<Sentiment, Record<Sentiment | 'error', number>>;
}

function emptyConfusion(): ClassificationReport['confusion'] {
  const row = (): Record<Sentiment | 'error', number> =>
    Object.fromEntries([...SENTIMENTS, 'error'].map((k) => [k, 0])) as Record<
      Sentiment | 'error',
      number
    >;
  return Object.fromEntries(SENTIMENTS.map((s) => [s, row()])) as ClassificationReport['confusion'];
}

export function classification(preds: readonly Prediction[]): ClassificationReport {
  const n = preds.length;
  const confusion = emptyConfusion();
  for (const p of preds) confusion[p.expected][p.got ?? 'error'] += 1;
  const perClass = SENTIMENTS.map((label): ClassMetrics => {
    const tp = preds.filter((p) => p.expected === label && p.got === label).length;
    const fp = preds.filter((p) => p.expected !== label && p.got === label).length;
    const fn = preds.filter((p) => p.expected === label && p.got !== label).length;
    return { label, support: tp + fn, predicted: tp + fp, ...prf(tp, fp, fn) };
  });
  const inMacro = perClass.filter((c) => c.support > 0 || c.predicted > 0);
  return {
    n,
    strict: n ? preds.filter((p) => p.got === p.expected).length / n : 0,
    lenient: n ? preds.filter((p) => p.got !== null && p.acceptable.includes(p.got)).length / n : 0,
    macroF1: inMacro.length ? inMacro.reduce((a, c) => a + c.f1, 0) / inMacro.length : 0,
    macroClasses: inMacro.length,
    perClass,
    confusion,
  };
}

/** Accuracy of a constant predictor (e.g. always `neutral`): the floor a real classifier must beat. */
export function constantFloor(
  preds: readonly Prediction[],
  label: Sentiment,
): ClassificationReport {
  return classification(preds.map((p) => ({ ...p, got: label })));
}

export interface RiskReport {
  n: number;
  mae: number;
  exact: number;
  /** Mean signed error (got − expected); > 0 = over-alerting. */
  bias: number;
}
export function riskMetrics(
  pairs: readonly { expected: RiskLevel; got: RiskLevel | null }[],
): RiskReport {
  const ok = pairs.filter((p): p is { expected: RiskLevel; got: RiskLevel } => p.got !== null);
  const d = ok.map((p) => RISK_ORDER[p.got] - RISK_ORDER[p.expected]);
  const n = ok.length;
  return {
    n,
    mae: n ? d.reduce((a, x) => a + Math.abs(x), 0) / n : Number.NaN,
    exact: n ? d.filter((x) => x === 0).length / n : Number.NaN,
    bias: n ? d.reduce((a, x) => a + x, 0) / n : Number.NaN,
  };
}

/** Binary P/R/F1 + agreement for flags; null predictions count as `false`. */
export function binary(pairs: readonly { truth: boolean; got: boolean | null }[]): Prf & {
  n: number;
  agreement: number;
  positives: number;
} {
  const tp = pairs.filter((p) => p.truth && p.got === true).length;
  const fp = pairs.filter((p) => !p.truth && p.got === true).length;
  const fn = pairs.filter((p) => p.truth && p.got !== true).length;
  const agree = pairs.filter((p) => p.truth === (p.got === true)).length;
  return {
    ...prf(tp, fp, fn),
    n: pairs.length,
    agreement: pairs.length ? agree / pairs.length : 0,
    positives: pairs.filter((p) => p.truth).length,
  };
}

/** Wilson 95% interval for a proportion k/n (honest error bars for small n). */
export function wilson(k: number, n: number, z = 1.96): [number, number] {
  if (n === 0) return [Number.NaN, Number.NaN];
  const p = k / n;
  const den = 1 + (z * z) / n;
  const centre = (p + (z * z) / (2 * n)) / den;
  const half = (z * Math.sqrt((p * (1 - p)) / n + (z * z) / (4 * n * n))) / den;
  return [Math.max(0, centre - half), Math.min(1, centre + half)];
}
