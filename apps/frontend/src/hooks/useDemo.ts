import { useCallback, useEffect, useRef, useState } from 'react';
import type { TelemetryRequestWire } from '@app/contracts';
import { buildDemoRequests } from '../lib/demo';

function sleep(ms: number, signal: AbortSignal): Promise<void> {
  return new Promise((resolve) => {
    const t = setTimeout(resolve, ms);
    signal.addEventListener('abort', () => (clearTimeout(t), resolve()), { once: true });
  });
}

interface Deps {
  send: (req: TelemetryRequestWire, signal?: AbortSignal) => Promise<boolean>;
  pin: (sessionId: string) => void;
}

/** Plays the scripted negotiation. Aborts in-flight POSTs and timers on unmount. `?demo=fast` autostarts. */
export function useDemo({ send, pin }: Deps) {
  const [playing, setPlaying] = useState(false);
  const ctl = useRef<AbortController | null>(null);

  const play = useCallback(
    async (fast: boolean) => {
      ctl.current?.abort();
      const c = new AbortController();
      ctl.current = c;
      const reqs = buildDemoRequests();
      const first = reqs[0];
      if (first) pin(first.session_id);
      setPlaying(true);
      for (const req of reqs) {
        if (c.signal.aborted) return;
        await send(req, c.signal);
        if (!fast) await sleep(1000 + Math.random() * 2000, c.signal);
      }
      if (!c.signal.aborted) setPlaying(false);
    },
    [send, pin],
  );

  useEffect(() => {
    // Deferred so React StrictMode's mount/unmount/mount never fires a throwaway run.
    const t =
      new URLSearchParams(window.location.search).get('demo') === 'fast'
        ? setTimeout(() => void play(true), 0)
        : undefined;
    return () => {
      if (t) clearTimeout(t);
      ctl.current?.abort();
    };
  }, [play]);

  return { playing, play };
}
