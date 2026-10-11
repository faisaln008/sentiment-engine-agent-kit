import { Header } from './components/Header';
import { Mitigation } from './components/Mitigation';
import { SentimentStream } from './components/SentimentStream';
import { TrafficLight } from './components/TrafficLight';
import { VolatilityAlert } from './components/VolatilityAlert';
import { useDemo } from './hooks/useDemo';
import { useTelemetry } from './hooks/useTelemetry';
import { useVolatilityView } from './hooks/useVolatility';
import { serverP50 } from './lib/stats';
import './styles.css';

export function App() {
  const { state, ws, mode, send, pin } = useTelemetry();
  const { playing, play } = useDemo({ send, pin });
  const items = state.activeSessionId ? (state.sessions[state.activeSessionId] ?? []) : [];
  const latest = items[0];
  const volatility = useVolatilityView(items);

  return (
    <div className="app">
      <Header
        sessionId={state.activeSessionId}
        ws={ws}
        mode={mode}
        p50={serverP50(items)}
        playing={playing}
        onPlay={() => void play(false)}
      />
      <main className="main">
        <div className="top">
          <TrafficLight
            risk={latest?.result.risk_level ?? null}
            sentiment={latest?.result.sentiment ?? null}
          />
          <Mitigation items={items} />
        </div>
        <VolatilityAlert view={volatility} />
        <SentimentStream items={items} />
      </main>
    </div>
  );
}
