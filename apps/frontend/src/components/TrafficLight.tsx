import type { RiskLevel, Sentiment } from '@app/contracts';
import { RISK_META } from '../lib/risk';

interface Props {
  risk: RiskLevel | null;
  sentiment: Sentiment | null;
}

export function TrafficLight({ risk, sentiment }: Props) {
  const m = risk ? RISK_META[risk] : null;
  return (
    <section className="panel light-panel" aria-label="Risk level">
      <h2 className="panel-title">Risk</h2>
      {/* key remounts the node on every level change so role=alert (critical) is announced afresh */}
      <div
        key={risk ?? 'none'}
        className={`light risk-${risk ?? 'none'}`}
        role={m?.role ?? 'status'}
      >
        <span className="light-icon" aria-hidden="true">
          {m?.icon ?? '–'}
        </span>
        <span className="light-label">{m?.label ?? 'WAITING'}</span>
      </div>
      <p className="light-sentiment">
        {sentiment ? (
          <>
            Sentiment: <span className={`chip sent-${sentiment}`}>{sentiment}</span>
          </>
        ) : (
          'No data yet'
        )}
      </p>
    </section>
  );
}
