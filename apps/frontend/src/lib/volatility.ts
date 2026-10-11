import type { StreamItem } from './store';

export const VOLATILITY_DECAY_MS = 8000;

export interface VolatilityView {
  /** active: newest chunk is itself volatile. recent: a calmer chunk has arrived since. */
  tone: 'active' | 'recent';
  trigger: string;
  ageS: number;
}

/** Pure. `items` newest first. null once the newest volatile chunk is older than the decay window. */
export function volatilityView(items: readonly StreamItem[], now: number): VolatilityView | null {
  const idx = items.findIndex((i) => i.result.volatility_flag);
  const v = items[idx];
  if (!v) return null;
  const age = now - v.received_at;
  if (age >= VOLATILITY_DECAY_MS) return null;
  return {
    tone: idx === 0 ? 'active' : 'recent',
    trigger: v.text_excerpt || v.result.hidden_intent,
    ageS: Math.max(0, Math.floor(age / 1000)),
  };
}

/** received_at of the newest volatile item, or null. */
export function newestVolatileAt(items: readonly StreamItem[]): number | null {
  return items.find((i) => i.result.volatility_flag)?.received_at ?? null;
}
