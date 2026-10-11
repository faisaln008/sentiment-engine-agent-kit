import type { AcousticField, AcousticMetadata } from '@app/contracts';

/**
 * Per-speaker acoustic baseline (SPEC §4, ADR-003 §1). Pure: every function returns new values.
 *
 * Std choice (T9): SAMPLE std, sqrt(m2 / (n - 1)), identical to eval/lib/volatility-oracle.ts. Priors (mean and
 * std) are used while a field has < 2 observed values; the effective std is floored at 0.5 x prior std so a
 * monotone speaker cannot produce huge z-scores; z is clamped to [-4, 4].
 * Callers compute z from the baseline as it was BEFORE the current chunk (snapshot at arrival), then observe().
 */
export const BASELINE_FIELDS = [
  'pitch_volatility',
  'speech_rate_wpm',
  'pause_duration_ms',
  'volume_intensity',
] as const satisfies readonly AcousticField[];

/** Fields that make up arousal. Pause is a hesitation cue for the prompt, not arousal. */
export const AROUSAL_FIELDS = ['pitch_volatility', 'speech_rate_wpm', 'volume_intensity'] as const;

export const PRIORS: Readonly<Record<AcousticField, { mean: number; std: number }>> = {
  pitch_volatility: { mean: 0.35, std: 0.2 },
  speech_rate_wpm: { mean: 150, std: 30 },
  pause_duration_ms: { mean: 400, std: 300 },
  volume_intensity: { mean: 0.5, std: 0.15 },
};

export interface FieldStats {
  readonly n: number;
  readonly mean: number;
  readonly m2: number;
}
export type Baseline = Readonly<Record<AcousticField, FieldStats>>;
export type ZScores = Readonly<Record<AcousticField, number>>;

const ZERO: FieldStats = { n: 0, mean: 0, m2: 0 };
const clamp = (x: number, lo: number, hi: number): number => Math.min(hi, Math.max(lo, x));

export const emptyBaseline = (): Baseline => ({
  pitch_volatility: ZERO,
  speech_rate_wpm: ZERO,
  pause_duration_ms: ZERO,
  volume_intensity: ZERO,
});

export function zScore(s: FieldStats, f: AcousticField, x: number): number {
  const p = PRIORS[f];
  const mean = s.n < 2 ? p.mean : s.mean;
  const std = s.n < 2 ? p.std : Math.sqrt(s.m2 / (s.n - 1));
  return clamp((x - mean) / Math.max(std, 0.5 * p.std), -4, 4);
}

/** z per field against the baseline; imputed (missing) fields contribute 0. */
export function zScores(
  b: Baseline,
  a: AcousticMetadata,
  imputed: readonly AcousticField[],
): ZScores {
  const z = (f: AcousticField): number => (imputed.includes(f) ? 0 : zScore(b[f], f, a[f]));
  return {
    pitch_volatility: z('pitch_volatility'),
    speech_rate_wpm: z('speech_rate_wpm'),
    pause_duration_ms: z('pause_duration_ms'),
    volume_intensity: z('volume_intensity'),
  };
}

export const arousalZ = (z: ZScores): number =>
  (z.pitch_volatility + z.speech_rate_wpm + z.volume_intensity) / 3;

function step(s: FieldStats, x: number): FieldStats {
  const n = s.n + 1;
  const d = x - s.mean;
  const mean = s.mean + d / n;
  return { n, mean, m2: s.m2 + d * (x - mean) };
}

/** Welford update over OBSERVED fields only (imputed fields are skipped). */
export function observe(
  b: Baseline,
  a: AcousticMetadata,
  imputed: readonly AcousticField[],
): Baseline {
  const next = (f: AcousticField): FieldStats => (imputed.includes(f) ? b[f] : step(b[f], a[f]));
  return {
    pitch_volatility: next('pitch_volatility'),
    speech_rate_wpm: next('speech_rate_wpm'),
    pause_duration_ms: next('pause_duration_ms'),
    volume_intensity: next('volume_intensity'),
  };
}

/** |z| < 1 normal; 1..2 higher/lower; >= 2 much higher/lower (SPEC §4). */
export function describeZ(z: number): string {
  const a = Math.abs(z);
  if (a < 1) return 'normal';
  return `${a >= 2 ? 'much ' : ''}${z > 0 ? 'higher' : 'lower'}`;
}

/** Prompt descriptor line vs this speaker's norm. Imputed fields are reported as unknown, never guessed. */
export function describeAcoustics(
  a: AcousticMetadata,
  imputed: readonly AcousticField[],
  baseline: Baseline = emptyBaseline(),
): string {
  const z = zScores(baseline, a, imputed);
  const d = (f: AcousticField): string => (imputed.includes(f) ? 'unknown' : describeZ(z[f]));
  const pause = imputed.includes('pause_duration_ms')
    ? 'unknown'
    : z.pause_duration_ms >= 1.5 || a.pause_duration_ms > 800
      ? `long (${(a.pause_duration_ms / 1000).toFixed(1)}s)`
      : z.pause_duration_ms <= -1
        ? 'short'
        : 'normal';
  return `pitch ${d('pitch_volatility')}; pace ${d('speech_rate_wpm')}; pause ${pause}; volume ${d('volume_intensity')}`;
}
