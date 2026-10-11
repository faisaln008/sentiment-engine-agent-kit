import { useEffect, useState } from 'react';
import type { StreamItem } from '../lib/store';
import { newestVolatileAt, volatilityView, type VolatilityView } from '../lib/volatility';

/** Re-evaluates once a second while a volatile chunk is inside the decay window. */
export function useVolatilityView(items: readonly StreamItem[]): VolatilityView | null {
  const at = newestVolatileAt(items);
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (at === null) return;
    setNow(Date.now());
    const t = setInterval(() => {
      const n = Date.now();
      setNow(n);
      if (volatilityView(items, n) === null) clearInterval(t);
    }, 1000);
    return () => clearInterval(t);
    // items identity changes every ingest; `at` is what (re)arms the window.
  }, [at]);
  return volatilityView(items, Math.max(now, at ?? 0));
}
