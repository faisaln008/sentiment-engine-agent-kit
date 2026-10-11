/** Pure helpers for the A/B report (ab-compare.ts): bootstrap CI of a median and the S3c winner rule. */
import { percentile } from './stats.js';

/** Deterministic PRNG (mulberry32) so the CI in a committed report is reproducible. */
function rng(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export interface MedianCi {
  median: number;
  lo: number;
  hi: number;
  /** Share of bootstrap medians ≥ the budget (how often a re-run would miss it). */
  pAtOrAbove: number;
  n: number;
}

/** Percentile bootstrap (95%) of the nearest-rank median; `budget` gives P(median ≥ budget). */
export function bootstrapMedian(
  xs: readonly number[],
  budget: number,
  iters = 2000,
  seed = 1,
): MedianCi {
  const n = xs.length;
  if (n === 0) return { median: NaN, lo: NaN, hi: NaN, pAtOrAbove: NaN, n };
  const next = rng(seed);
  const meds: number[] = [];
  for (let i = 0; i < iters; i++) {
    const s = Array.from({ length: n }, () => xs[Math.floor(next() * n)] ?? 0);
    meds.push(percentile(s, 50));
  }
  return {
    median: percentile(xs, 50),
    lo: percentile(meds, 2.5),
    hi: percentile(meds, 97.5),
    pAtOrAbove: meds.filter((m) => m >= budget).length / iters,
    n,
  };
}

export interface ArmScore {
  name: string;
  macroF1: number;
  p50: number;
  n: number;
  /** Author's validity rule: a bench with any provider 429 is not evidence for latency. */
  validForLatency: boolean;
}

/** TASKS S3c: highest macro-F1 among arms with p50 < budget; plus the author's validity rule (no provider 429). */
export function winnerLine(arms: readonly ArmScore[], budget: number): string {
  const ok = arms.filter((s) => s.validForLatency && s.p50 < budget);
  const best = [...ok].sort((x, y) => y.macroF1 - x.macroF1)[0];
  if (!best)
    return `Rule (TASKS S3c: highest macro-F1 among arms with bench p50 < ${budget} ms; author's validity rule: no provider 429): **no arm qualifies**.`;
  return (
    `Rule (TASKS S3c: highest macro-F1 among arms with bench p50 < ${budget} ms; author's validity rule: no provider 429 in the bench): ` +
    `**${best.name}** (macro-F1 ${best.macroF1.toFixed(2)}; p50 ${best.p50} ms = ${budget - best.p50} ms under budget, n ${best.n}).`
  );
}
