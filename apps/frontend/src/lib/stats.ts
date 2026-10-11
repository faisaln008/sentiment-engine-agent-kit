import type { StreamItem } from './store';

export const P50_WINDOW = 20;

/** Median (lower middle for even n) of the server-reported latency of the last `n` items. */
export function serverP50(items: readonly StreamItem[], n: number = P50_WINDOW): number | null {
  const v = items
    .slice(0, n)
    .map((i) => i.result.processing_latency_ms)
    .sort((a, b) => a - b);
  return v.length === 0 ? null : (v[Math.floor((v.length - 1) / 2)] ?? null);
}
