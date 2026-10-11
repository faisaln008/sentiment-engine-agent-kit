import type { Classifier, ClassifyInput, ClassifyResult } from './classifier.js';
import { CircuitBreaker } from './circuit-breaker.js';

type Failure = Extract<ClassifyResult, { ok: false }>;

export interface ChainOptions {
  /** Providers in priority order (primary first). */
  providers: readonly Classifier[];
  circuitFailures: number;
  circuitCooldownMs: number;
  /** Per-provider concurrent call cap; at the cap a provider is skipped like an open breaker. */
  maxInflight: number;
  onDisabled?: (provider: string, status: number) => void;
  onBreakerOpen?: (provider: string, info: { retryAfterMs: number; cooldownMs: number }) => void;
  now?: () => number;
}

interface Slot {
  c: Classifier;
  breaker: CircuitBreaker;
  inflight: number;
  disabled: boolean;
}

/**
 * A Classifier of Classifiers. Sequential: the next provider is tried only after the current one returned
 * http / bad_json / rate_limited (or was skipped: open breaker, cap, disabled). No timer hedge, no parallel
 * calls. The caller's signal is the deadline counted from t0, so the next provider implicitly gets
 * `deadline - elapsed`; when it fires the in-flight call is aborted and `timeout` is returned (the caller
 * answers with the heuristic). Never throws.
 */
export class FallbackChain implements Classifier {
  readonly name = 'chain';
  private readonly slots: Slot[];

  constructor(private readonly o: ChainOptions) {
    const now = o.now ?? ((): number => performance.now());
    this.slots = o.providers.map((c) => ({
      c,
      breaker: new CircuitBreaker(o.circuitFailures, o.circuitCooldownMs, now, (i) =>
        o.onBreakerOpen?.(c.name, i),
      ),
      inflight: 0,
      disabled: false,
    }));
  }

  /** `/health.mode`: first provider that is not auth-disabled, else `heuristic`. */
  mode(): string {
    const s = this.slots.find((x) => !x.disabled);
    return s === undefined ? 'heuristic' : `llm:${s.c.name}`;
  }

  async classify(input: ClassifyInput, signal: AbortSignal): Promise<ClassifyResult> {
    let real: Failure | undefined; // first genuine provider failure wins over later skips
    let skipped: Failure = { ok: false, reason: 'circuit_open', provider: this.name, ms: 0 };
    for (const s of this.slots) {
      if (signal.aborted) {
        const out: Failure = { ...(real ?? skipped), reason: 'timeout' };
        delete out.skip; // a timeout is not a skip
        return out;
      }
      const skip = this.skipReason(s);
      if (skip !== null) {
        skipped = { ok: false, reason: 'circuit_open', provider: s.c.name, ms: 0, skip };
        continue;
      }
      const r = await this.call(s, input, signal);
      if (r.ok) return r;
      real ??= r;
      if (r.reason === 'timeout') return r;
    }
    return real ?? skipped;
  }

  private skipReason(s: Slot): 'breaker' | 'cap' | 'disabled' | null {
    if (s.disabled) return 'disabled';
    if (s.inflight >= this.o.maxInflight) return 'cap';
    return s.breaker.allow() ? null : 'breaker';
  }

  private async call(s: Slot, input: ClassifyInput, signal: AbortSignal): Promise<ClassifyResult> {
    s.inflight += 1;
    try {
      const r = await s.c.classify(input, signal);
      if (r.ok) s.breaker.onSuccess();
      else if (r.reason === 'no_key') s.disabled = true;
      else {
        s.breaker.onFailure(r.reason === 'rate_limited' ? r.retryAfterMs : undefined);
        if (r.status === 401 || r.status === 403) this.disable(s, r.status);
      }
      return r;
    } catch {
      s.breaker.onFailure();
      return { ok: false, reason: signal.aborted ? 'timeout' : 'http', provider: s.c.name, ms: 0 };
    } finally {
      s.inflight -= 1;
    }
  }

  private disable(s: Slot, status: number): void {
    if (s.disabled) return;
    s.disabled = true;
    this.o.onDisabled?.(s.c.name, status);
  }
}
