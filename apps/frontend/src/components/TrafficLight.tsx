import type { RiskLevel, Sentiment } from '@app/contracts';

const META: Record<RiskLevel, { icon: string; label: string }> = {
  low: { icon: '✓', label: 'LOW' },
  medium: { icon: '!', label: 'MEDIUM' },
  high: { icon: '▲', label: 'HIGH' },
  critical: { icon: '⛔', label: 'CRITICAL' },
};

interface Props {
  risk: RiskLevel | null;
  sentiment: Sentiment | null;
}

export function TrafficLight({ risk, sentiment }: Props) {
  const m = risk ? META[risk] : null;
  // Critical is announced assertively once, when the element mounts.
  const alertProps = risk === 'critical' ? { role: 'alert' } : { role: 'status' };
  return (
    <section className="panel light-panel" aria-label="Risk level">
      <h2 className="panel-title">Risk</h2>
      <div className={`light risk-${risk ?? 'none'}`} {...alertProps}>
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
