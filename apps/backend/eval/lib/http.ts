/**
 * Client helpers for eval/bench/simulate: typed POST (wire schema in, response schema out), /health,
 * a global RPM throttle and a small concurrency pool. Platform fetch only (no new dependency).
 */
import {
  HealthSchema,
  TelemetryRequestWireSchema,
  TelemetryResponseSchema,
  type Health,
  type TelemetryRequestWire,
  type TelemetryResponse,
} from '@app/contracts';

export interface PostResult {
  status: number;
  /** Client-side wall time around fetch + body read (performance.now()). */
  clientMs: number;
  /** Schema-valid response, or null (non-200, network error, invalid body, chunk_id echo mismatch). */
  response: TelemetryResponse | null;
  error: string | null;
}

/** POST one chunk. Never throws. `timeoutMs` bounds the client wait (not the server deadline). */
export async function postChunk(
  target: string,
  body: TelemetryRequestWire,
  timeoutMs = 10_000,
): Promise<PostResult> {
  const payload = JSON.stringify(TelemetryRequestWireSchema.parse(body));
  const t0 = performance.now();
  try {
    const res = await fetch(`${target}/api/telemetry/stream`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: payload,
      signal: AbortSignal.timeout(timeoutMs),
    });
    const json: unknown = await res.json().catch(() => null);
    const clientMs = performance.now() - t0;
    if (res.status !== 200)
      return { status: res.status, clientMs, response: null, error: `http_${res.status}` };
    const parsed = TelemetryResponseSchema.safeParse(json);
    if (!parsed.success) return { status: 200, clientMs, response: null, error: 'schema_invalid' };
    if (parsed.data.chunk_id !== body.chunk_id)
      return { status: 200, clientMs, response: null, error: 'chunk_id_mismatch' };
    return { status: 200, clientMs, response: parsed.data, error: null };
  } catch (e) {
    const name = e instanceof Error ? e.name : 'Error';
    return {
      status: 0,
      clientMs: performance.now() - t0,
      response: null,
      error: name === 'TimeoutError' ? 'client_timeout' : 'network',
    };
  }
}

/** GET /health; null when unreachable or not shape-compatible. */
export async function getHealth(target: string, timeoutMs = 1500): Promise<Health | null> {
  try {
    const res = await fetch(`${target}/health`, { signal: AbortSignal.timeout(timeoutMs) });
    const parsed = HealthSchema.safeParse(await res.json());
    return res.ok && parsed.success ? parsed.data : null;
  } catch {
    return null;
  }
}

/** Polls /health until it answers or `totalMs` elapses. */
export async function waitForHealth(target: string, totalMs: number): Promise<Health | null> {
  const end = performance.now() + totalMs;
  while (performance.now() < end) {
    const h = await getHealth(target, 500);
    if (h) return h;
    await sleep(100);
  }
  return null;
}

export const sleep = (ms: number): Promise<void> =>
  new Promise((r) => setTimeout(r, Math.max(0, ms)));

/**
 * Global start-rate limiter: at most `rpm` request starts per minute, evenly spaced.
 * rpm <= 0 disables throttling. Records start times so reports can state the RPM actually used.
 */
export class Throttle {
  private next = 0;
  readonly starts: number[] = [];
  constructor(readonly rpm: number) {}

  async acquire(): Promise<void> {
    if (this.rpm > 0) {
      const now = performance.now();
      const slot = Math.max(now, this.next);
      this.next = slot + 60_000 / this.rpm;
      await sleep(slot - now);
    }
    this.starts.push(performance.now());
  }

  /** Requests per minute actually started (over the active window; NaN for < 2 starts). */
  achievedRpm(): number {
    const first = this.starts[0];
    const last = this.starts[this.starts.length - 1];
    if (first === undefined || last === undefined || this.starts.length < 2) return Number.NaN;
    const minutes = (last - first) / 60_000;
    return minutes > 0 ? (this.starts.length - 1) / minutes : Number.POSITIVE_INFINITY;
  }
}

/** Runs `tasks` with at most `limit` in flight; results in input order. Tracks peak concurrency. */
export async function pool<T>(
  tasks: readonly (() => Promise<T>)[],
  limit: number,
): Promise<{ results: T[]; peak: number }> {
  const results: T[] = new Array<T>(tasks.length);
  let i = 0;
  let inFlight = 0;
  let peak = 0;
  const worker = async (): Promise<void> => {
    while (i < tasks.length) {
      const idx = i++;
      const task = tasks[idx];
      if (!task) continue;
      inFlight += 1;
      peak = Math.max(peak, inFlight);
      try {
        results[idx] = await task();
      } finally {
        inFlight -= 1;
      }
    }
  };
  await Promise.all(Array.from({ length: Math.max(1, Math.min(limit, tasks.length)) }, worker));
  return { results, peak };
}

/** Strips a trailing slash so `${target}/health` is well-formed. */
export const normTarget = (t: string): string => t.replace(/\/+$/, '');
