/**
 * Label-consistency oracle for `expected_volatility` (SPEC §4/§5.1, ADR-003), fed with the EXPECTED labels.
 * Eval-only re-statement of the frozen formula so the dataset can be checked before domain/ exists (S5).
 * It is not imported by the backend; if domain/volatility.ts and this disagree, the SPEC decides.
 */
import type { Sentiment } from '@app/contracts';
import type { LabelledChunk } from './dataset.js';
import { volatilityThreshold } from './env-defaults.js';

type Field = 'pitch_volatility' | 'speech_rate_wpm' | 'volume_intensity';
const AROUSAL_FIELDS: readonly Field[] = [
  'pitch_volatility',
  'speech_rate_wpm',
  'volume_intensity',
];
const PRIORS: Record<Field, { mean: number; std: number }> = {
  pitch_volatility: { mean: 0.35, std: 0.2 },
  speech_rate_wpm: { mean: 150, std: 30 },
  volume_intensity: { mean: 0.5, std: 0.15 },
};
export const VALENCE: Record<Sentiment, number> = {
  positive: 1,
  appeasement: 0.6,
  neutral: 0.5,
  deflecting: 0.4,
  negative: 0.3,
  sarcastic: 0.2,
  aggressive: 0,
};
const THRESHOLD = volatilityThreshold();
/** Same env var as the backend (VOLATILITY_THRESHOLD, fallback 0.6); reports print the value and its source. */
export const VOLATILITY_THRESHOLD = THRESHOLD.value;
export const VOLATILITY_THRESHOLD_SOURCE = THRESHOLD.source;

interface Welford {
  n: number;
  mean: number;
  m2: number;
}
interface SpeakerState {
  stats: Record<Field, Welford>;
  prev?: { arousal: number; sentiment: Sentiment };
}

const clamp = (x: number, lo: number, hi: number): number => Math.min(hi, Math.max(lo, x));

function zScore(w: Welford, f: Field, x: number): number {
  const prior = PRIORS[f];
  // Priors while the speaker has < 2 observed values; sample std otherwise; floor 0.5·prior_std.
  const mean = w.n < 2 ? prior.mean : w.mean;
  const std = w.n < 2 ? prior.std : Math.sqrt(w.m2 / (w.n - 1));
  return clamp((x - mean) / Math.max(std, 0.5 * prior.std), -4, 4);
}

function observe(w: Welford, x: number): void {
  w.n += 1;
  const d = x - w.mean;
  w.mean += d / w.n;
  w.m2 += d * (x - w.mean);
}

const freshState = (): SpeakerState => ({
  stats: {
    pitch_volatility: { n: 0, mean: 0, m2: 0 },
    speech_rate_wpm: { n: 0, mean: 0, m2: 0 },
    volume_intensity: { n: 0, mean: 0, m2: 0 },
  },
});

export interface VolatilityTrace {
  chunk_id: string;
  arousal_z: number;
  v: number;
  flag: boolean;
}

/**
 * Replays one session (timestamp order) and returns v per chunk. `sentimentOf` picks the label used for the
 * valence terms: the expected label (validator, formula ceiling) or the label the API returned (fusion fidelity).
 */
export function traceSession(
  chunks: readonly LabelledChunk[],
  sentimentOf: (c: LabelledChunk) => Sentiment = (c) => c.expected_sentiment,
): VolatilityTrace[] {
  const speakers = new Map<string, SpeakerState>();
  return chunks.map((c) => {
    const st = speakers.get(c.speaker) ?? freshState();
    speakers.set(c.speaker, st);
    const zs = AROUSAL_FIELDS.map((f) => zScore(st.stats[f], f, c.acoustic_metadata[f]));
    const arousal = zs.reduce((a, b) => a + b, 0) / zs.length;
    const dz = st.prev ? Math.min(1, Math.abs(arousal - st.prev.arousal) / 2) : 0;
    const sentiment = sentimentOf(c);
    const dv = st.prev ? Math.abs(VALENCE[st.prev.sentiment] - VALENCE[sentiment]) : 0;
    const v = clamp(0.4 * dz + 0.4 * dv + 0.2 * c.acoustic_metadata.pitch_volatility, 0, 1);
    for (const f of AROUSAL_FIELDS) observe(st.stats[f], c.acoustic_metadata[f]);
    st.prev = { arousal, sentiment };
    return { chunk_id: c.chunk_id, arousal_z: arousal, v, flag: v + 1e-9 >= VOLATILITY_THRESHOLD };
  });
}
