export function VolatilityAlert({ active }: { active: boolean }) {
  // Fixed-height slot so the layout never jumps when the banner appears.
  return (
    <div className="alert-slot">
      {active ? (
        <div className="alert-banner" role="alert">
          <span aria-hidden="true">⚠</span> VOLATILITY ALERT — tone is escalating, slow down
        </div>
      ) : (
        <div className="alert-idle">Volatility: stable</div>
      )}
    </div>
  );
}
