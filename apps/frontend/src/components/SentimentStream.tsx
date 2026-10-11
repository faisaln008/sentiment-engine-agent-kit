import type { StreamItem } from '../lib/store';

function time(ms: number): string {
  return new Date(ms).toLocaleTimeString([], { hour12: false });
}

export function SentimentStream({ items }: { items: readonly StreamItem[] }) {
  return (
    <section className="panel stream" aria-label="Sentiment stream">
      <h2 className="panel-title">Stream</h2>
      {items.length === 0 ? (
        <p className="dim">No chunks yet.</p>
      ) : (
        <ul className="stream-list">
          {items.map((i) => (
            <li key={i.chunk_id} className="row">
              <span className="dim mono">{time(i.timestamp_ms)}</span>
              <span className="speaker">
                {i.speaker === 'candidate' ? 'You' : i.speaker === 'counterpart' ? 'Them' : '?'}
              </span>
              <span className={`chip sent-${i.result.sentiment}`}>{i.result.sentiment}</span>
              <span
                className="conf"
                role="img"
                aria-label={`confidence ${Math.round(i.result.confidence * 100)} percent`}
              >
                <span className="conf-fill" style={{ width: `${i.result.confidence * 100}%` }} />
              </span>
              <span className="intent" title={i.result.hidden_intent}>
                {i.result.hidden_intent}
              </span>
              <span className="dim mono">{i.result.processing_latency_ms} ms</span>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
