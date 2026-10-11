/** Cap on a provider-supplied retry-after so a hostile/buggy header cannot park a provider for hours. */
export const MAX_RETRY_AFTER_MS = 5 * 60_000;

/**
 * Per-provider breaker. Opens after `failures` CONSECUTIVE failures and stays open for
 * max(cooldownMs, longest retry-after seen since the last success, capped at 5 min).
 * Half-open: after the cooldown exactly ONE probe is let through; further callers are refused until that probe
 * reports (success closes the breaker, failure re-opens it) or `cooldownMs` passes without a report.
 * Clock is injected so tests control time.
 */
export class CircuitBreaker {
  private consecutive = 0;
  private openUntil = 0;
  private probeUntil = 0;
  private retryAfterMs = 0;

  constructor(
    private readonly failures: number,
    private readonly cooldownMs: number,
    private readonly now: () => number = () => performance.now(),
    private readonly onOpen?: (info: { retryAfterMs: number; cooldownMs: number }) => void,
  ) {}

  /** False while open or while a half-open probe is outstanding (caller skips the provider instantly). */
  allow(): boolean {
    const t = this.now();
    if (t < this.openUntil) return false;
    if (this.openUntil === 0) return true;
    if (t < this.probeUntil) return false;
    this.probeUntil = t + this.cooldownMs;
    return true;
  }

  onSuccess(): void {
    this.consecutive = 0;
    this.openUntil = 0;
    this.probeUntil = 0;
    this.retryAfterMs = 0;
  }

  onFailure(retryAfterMs?: number): void {
    this.consecutive += 1;
    if (retryAfterMs !== undefined) {
      this.retryAfterMs = Math.min(MAX_RETRY_AFTER_MS, Math.max(this.retryAfterMs, retryAfterMs));
    }
    if (this.consecutive >= this.failures) {
      const open = Math.max(this.cooldownMs, this.retryAfterMs);
      this.openUntil = this.now() + open;
      this.probeUntil = 0;
      this.onOpen?.({ retryAfterMs: this.retryAfterMs, cooldownMs: open });
    }
  }
}
