import { useEffect, useState } from 'react';
import type { StreamItem } from '../lib/store';

export const VOLATILITY_DECAY_MS = 8000;

/** True for 8 s after the newest volatile chunk arrived; a newer volatile chunk restarts the timer. */
export function useVolatilityActive(items: readonly StreamItem[]): boolean {
  const volatileId = items.find((i) => i.result.volatility_flag)?.chunk_id ?? null;
  const [active, setActive] = useState(false);
  useEffect(() => {
    if (!volatileId) {
      setActive(false);
      return;
    }
    setActive(true);
    const t = setTimeout(() => setActive(false), VOLATILITY_DECAY_MS);
    return () => clearTimeout(t);
  }, [volatileId]);
  return active;
}
