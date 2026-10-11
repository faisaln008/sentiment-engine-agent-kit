import { useEffect, useRef, useState } from 'react';
import { Mitigation } from './components/Mitigation';
import { SentimentStream } from './components/SentimentStream';
import { TrafficLight } from './components/TrafficLight';
import { VolatilityAlert } from './components/VolatilityAlert';
import { useTelemetry } from './hooks/useTelemetry';
import { useVolatilityActive } from './hooks/useVolatility';
import { buildDemoRequests } from './lib/demo';
import './styles.css';

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

export function App() {
  const { state, send } = useTelemetry();
  const [playing, setPlaying] = useState(false);
  const run = useRef(0);
  const items = state.activeSessionId ? (state.sessions[state.activeSessionId] ?? []) : [];
  const latest = items[0];
  const volatile = useVolatilityActive(items);

  const play = async (fast: boolean) => {
    const id = ++run.current;
    setPlaying(true);
    for (const req of buildDemoRequests()) {
      if (run.current !== id) return;
      await send(req);
      if (!fast) await sleep(1000 + Math.random() * 2000);
    }
    if (run.current === id) setPlaying(false);
  };

  useEffect(() => {
    const demo = new URLSearchParams(window.location.search).get('demo');
    if (demo) void play(demo === 'fast');
    return () => {
      run.current++;
    };
  }, []);

  return (
    <div className="app">
      <header className="header">
        <h1>Negotiation Copilot</h1>
        <span className="dim">Session: {state.activeSessionId ?? '—'}</span>
        <button type="button" className="btn" disabled={playing} onClick={() => void play(false)}>
          {playing ? 'Playing…' : 'Play demo'}
        </button>
      </header>
      <main className="main">
        <div className="top">
          <TrafficLight
            risk={latest?.result.risk_level ?? null}
            sentiment={latest?.result.sentiment ?? null}
          />
          <Mitigation items={items} />
        </div>
        <VolatilityAlert active={volatile} />
        <SentimentStream items={items} />
      </main>
    </div>
  );
}
