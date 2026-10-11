import { useEffect, useRef, useState } from 'react';
import { mitigationHistory } from '../lib/mitigation';
import type { StreamItem } from '../lib/store';

interface Props {
  /** Newest first. */
  items: readonly StreamItem[];
}

export function Mitigation({ items }: Props) {
  const [label, setLabel] = useState('Copy');
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const { current, previous } = mitigationHistory(items);

  useEffect(() => () => clearTimeout(timer.current), []);

  const flash = (text: string) => {
    setLabel(text);
    clearTimeout(timer.current);
    timer.current = setTimeout(() => setLabel('Copy'), 1500);
  };

  const copy = () => {
    if (!current) return;
    // navigator.clipboard is undefined in insecure contexts.
    if (!navigator.clipboard) return flash('Copy unavailable');
    navigator.clipboard.writeText(current).then(
      () => flash('Copied'),
      () => flash('Copy failed'),
    );
  };

  return (
    <section className="panel mitigation" aria-label="Mitigation suggestion">
      <h2 className="panel-title">Do this now</h2>
      <p className="mitigation-now" aria-live="polite" aria-atomic="true">
        {current ?? 'Waiting for the first chunk…'}
      </p>
      <button type="button" className="btn" onClick={copy} disabled={!current}>
        {label}
      </button>
      {previous.length > 0 && (
        <ol className="mitigation-prev" aria-label="Previous suggestions">
          {previous.map((m) => (
            <li key={m}>{m}</li>
          ))}
        </ol>
      )}
    </section>
  );
}
