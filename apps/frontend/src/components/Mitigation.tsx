import { useState } from 'react';
import type { StreamItem } from '../lib/store';

interface Props {
  /** Newest first. */
  items: readonly StreamItem[];
}

export function Mitigation({ items }: Props) {
  const [copied, setCopied] = useState(false);
  const current = items[0]?.result.mitigation_suggestion ?? null;
  const previous = items.slice(1, 3);

  const copy = () => {
    if (!current) return;
    navigator.clipboard.writeText(current).then(
      () => {
        setCopied(true);
        setTimeout(() => setCopied(false), 1500);
      },
      () => console.warn('clipboard unavailable'),
    );
  };

  return (
    <section className="panel mitigation" aria-label="Mitigation suggestion">
      <h2 className="panel-title">Do this now</h2>
      <p className="mitigation-now" aria-live="polite" aria-atomic="true">
        {current ?? 'Waiting for the first chunk…'}
      </p>
      <button type="button" className="btn" onClick={copy} disabled={!current}>
        {copied ? 'Copied' : 'Copy'}
      </button>
      {previous.length > 0 && (
        <ol className="mitigation-prev" aria-label="Previous suggestions">
          {previous.map((i) => (
            <li key={i.chunk_id}>{i.result.mitigation_suggestion}</li>
          ))}
        </ol>
      )}
    </section>
  );
}
