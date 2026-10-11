import type { Sentiment } from '@app/contracts';

/** ADR-003 §3 valence scale (positive 1 ... aggressive 0). */
export const VALENCE: Readonly<Record<Sentiment, number>> = {
  positive: 1,
  appeasement: 0.6,
  neutral: 0.5,
  deflecting: 0.4,
  negative: 0.3,
  sarcastic: 0.2,
  aggressive: 0,
};

export interface VolatilityInput {
  arousalZ: number;
  sentiment: Sentiment;
  pitchVolatility: number;
  /** Same speaker's previous committed chunk (snapshot at arrival); absent on a speaker's first chunk. */
  prev?: { arousalZ: number; sentiment: Sentiment } | undefined;
}

const clamp01 = (x: number): number => Math.min(1, Math.max(0, x));

/**
 * v = clamp01(0.4 min(1, |d arousal_z| / 2) + 0.4 valence_shift + 0.2 pitch_volatility)  (ADR-003 §3).
 * Known gaps (S2a validator table, left for S8): direction-blind, so de-escalations flag, and flat-delivery
 * stance flips can be missed.
 */
export function volatility(i: VolatilityInput): number {
  const dz = i.prev === undefined ? 0 : Math.min(1, Math.abs(i.arousalZ - i.prev.arousalZ) / 2);
  const dv = i.prev === undefined ? 0 : Math.abs(VALENCE[i.prev.sentiment] - VALENCE[i.sentiment]);
  return clamp01(0.4 * dz + 0.4 * dv + 0.2 * i.pitchVolatility);
}
