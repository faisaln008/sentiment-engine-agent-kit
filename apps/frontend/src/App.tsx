import { useTelemetry } from './hooks/useTelemetry';

/** S6a placeholder shell: proves the data path. Widgets arrive in S6b. */
export function App() {
  const { state, send } = useTelemetry();
  const items = state.activeSessionId ? (state.sessions[state.activeSessionId] ?? []) : [];

  const sendSample = () => {
    void send({
      chunk_id: `c-${Date.now()}`,
      session_id: 'demo',
      timestamp_ms: Date.now(),
      speaker: 'counterpart',
      text: 'We need a decision today or we walk away.',
      acoustic_metadata: { pitch_volatility: 0.8, speech_rate_wpm: 190 },
    });
  };

  return (
    <main>
      <h1>Negotiation Copilot</h1>
      <button type="button" onClick={sendSample}>
        Send sample chunk
      </button>
      <ul>
        {items.map((i) => (
          <li key={i.chunk_id}>
            {i.result.risk_level} / {i.result.sentiment} / {i.result.processing_latency_ms} ms
          </li>
        ))}
      </ul>
    </main>
  );
}
