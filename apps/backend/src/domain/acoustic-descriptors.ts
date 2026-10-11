import type { AcousticField, AcousticMetadata } from '@app/contracts';

/** SPEC §4 population priors. S5a replaces these with per-speaker baselines; the wording stays. */
const PRIORS = {
  pitch_volatility: { mean: 0.35, sd: 0.2 },
  speech_rate_wpm: { mean: 150, sd: 30 },
  volume_intensity: { mean: 0.5, sd: 0.15 },
} as const;

/** z -> "normal" | "higher/lower" | "much higher/much lower" (SPEC §4 thresholds). */
export function describeZ(z: number): string {
  const a = Math.abs(z);
  if (a < 1) return 'normal';
  return `${a >= 2 ? 'much ' : ''}${z > 0 ? 'higher' : 'lower'}`;
}

/** Pure. Descriptor line for the prompt; imputed fields are reported as unknown, never guessed. */
export function describeAcoustics(a: AcousticMetadata, imputed: readonly AcousticField[]): string {
  const d = (f: keyof typeof PRIORS): string =>
    imputed.includes(f) ? 'unknown' : describeZ((a[f] - PRIORS[f].mean) / PRIORS[f].sd);
  const pause = imputed.includes('pause_duration_ms')
    ? 'unknown'
    : a.pause_duration_ms > 800
      ? `long (${(a.pause_duration_ms / 1000).toFixed(1)}s)`
      : 'short';
  return `pitch ${d('pitch_volatility')}; pace ${d('speech_rate_wpm')}; pause ${pause}; volume ${d('volume_intensity')}`;
}
