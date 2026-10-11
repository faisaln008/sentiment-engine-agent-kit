import type { VolatilityView } from '../lib/volatility';

export function VolatilityAlert({ view }: { view: VolatilityView | null }) {
  // Fixed-height slot so the layout never jumps when the banner appears.
  return (
    <div className="alert-slot">
      {view?.tone === 'active' && (
        <div className="alert-banner" role="alert">
          <span aria-hidden="true">⚠</span> VOLATILITY ALERT
          <span className="alert-detail">
            {' '}
            · “{view.trigger}” · {view.ageS}s ago
          </span>
        </div>
      )}
      {view?.tone === 'recent' && (
        <div className="alert-recent" role="status">
          <span aria-hidden="true">!</span> Recent spike {view.ageS}s ago
          <span className="alert-detail"> · “{view.trigger}”</span>
        </div>
      )}
      {!view && <div className="alert-idle">Volatility: stable</div>}
    </div>
  );
}
