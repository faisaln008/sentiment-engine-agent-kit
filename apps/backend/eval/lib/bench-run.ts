/**
 * Bench scenarios (latency-engineering skill): (a) N sequential chunks in one session, (b) S sessions × K chunks
 * concurrently (sessions in parallel, chunks sequential), (c) cold boot: first 5 chunks after spawning a fresh
 * backend process. Payloads reuse tune-split texts/acoustics with fresh ids (typed by TelemetryRequestWireSchema).
 */
import { spawn } from 'node:child_process';
import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import type { TelemetryRequestWire } from '@app/contracts';
import { toRequest, type LabelledChunk } from './dataset.js';
import { pool, postChunk, sleep, waitForHealth, type Throttle } from './http.js';
import { logKey, parseServerLog, type ServerLog } from './server-log.js';

export interface Sample {
  scenario: string;
  key: string;
  status: number;
  error: string | null;
  clientMs: number;
  serverMs: number | null;
}

export interface ScenarioResult {
  name: string;
  samples: Sample[];
  peakInFlight: number;
  rpm: number;
  wallS: number;
  note: string;
}

/** Builds `n` chunks for one session by cycling over the dataset rows (ids/timestamps are fresh). */
export function makeChunks(
  src: readonly LabelledChunk[],
  sessionId: string,
  n: number,
  offset = 0,
): TelemetryRequestWire[] {
  return Array.from({ length: n }, (_, i) => {
    const row = src[(offset + i) % src.length];
    if (!row) throw new Error('empty bench source');
    return {
      ...toRequest(row),
      session_id: sessionId,
      chunk_id: `${sessionId}-c${i + 1}`,
      timestamp_ms: 1_760_000_000_000 + i * 2000,
    };
  });
}

class InFlight {
  now = 0;
  peak = 0;
  async run<T>(f: () => Promise<T>): Promise<T> {
    this.now += 1;
    this.peak = Math.max(this.peak, this.now);
    try {
      return await f();
    } finally {
      this.now -= 1;
    }
  }
}

async function send(
  target: string,
  body: TelemetryRequestWire,
  scenario: string,
  throttle: Throttle,
  inflight: InFlight,
  timeoutMs: number,
): Promise<Sample> {
  await throttle.acquire();
  const r = await inflight.run(() => postChunk(target, body, timeoutMs));
  return {
    scenario,
    key: logKey(body.session_id, body.chunk_id),
    status: r.status,
    error: r.error,
    clientMs: r.clientMs,
    serverMs: r.response?.processing_latency_ms ?? null,
  };
}

const rpmOf = (n: number, wallS: number): number => (wallS > 0 ? (60 * n) / wallS : Number.NaN);

/** Runs sessions (each a sequential list of chunks) with up to `parallel` sessions at once. */
export async function runSessions(
  name: string,
  target: string,
  sessions: TelemetryRequestWire[][],
  parallel: number,
  throttle: Throttle,
  timeoutMs: number,
  note: string,
): Promise<ScenarioResult> {
  const inflight = new InFlight();
  const t0 = performance.now();
  const tasks = sessions.map((list) => async (): Promise<Sample[]> => {
    const out: Sample[] = [];
    for (const body of list)
      out.push(await send(target, body, name, throttle, inflight, timeoutMs));
    return out;
  });
  const { results } = await pool(tasks, parallel);
  const samples = results.flat();
  const wallS = (performance.now() - t0) / 1000;
  return {
    name,
    samples,
    peakInFlight: inflight.peak,
    rpm: rpmOf(samples.length, wallS),
    wallS,
    note,
  };
}

export const DIST_SERVER = fileURLToPath(new URL('../../dist/server.js', import.meta.url));

/**
 * Cold boot: spawns `node apps/backend/dist/server.js` on `port` (env PORT wins over .env), waits for /health,
 * then sends the first 5 chunks of a new session. The child's stdout (pino) is captured for provider stats.
 */
export async function coldBoot(
  src: readonly LabelledChunk[],
  port: number,
  runId: string,
  throttle: Throttle,
  timeoutMs: number,
): Promise<
  { result: ScenarioResult; bootMs: number; log: ServerLog; mode: string } | { skipped: string }
> {
  if (!existsSync(DIST_SERVER))
    return { skipped: 'apps/backend/dist/server.js missing (run npm run build)' };
  const target = `http://localhost:${port}`;
  if (await waitForHealth(target, 300)) return { skipped: `port ${port} already in use` };
  let stdout = '';
  const t0 = performance.now();
  const child = spawn(process.execPath, [DIST_SERVER], {
    env: { ...process.env, PORT: String(port), LOG_LEVEL: 'info' },
    stdio: ['ignore', 'pipe', 'ignore'], // stderr ignored: never drained, would block the child when full
  });
  child.stdout.on('data', (d: Buffer) => (stdout += d.toString()));
  try {
    const health = await waitForHealth(target, 15_000);
    const bootMs = performance.now() - t0;
    if (!health) return { skipped: 'spawned server did not answer /health within 15 s' };
    const chunks = makeChunks(src, `bench-${runId}-cold`, 5, 7);
    const result = await runSessions(
      'c) cold boot, first 5',
      target,
      [chunks],
      1,
      throttle,
      timeoutMs,
      `fresh process on :${port}; /health ready after ${Math.round(bootMs)} ms`,
    );
    await sleep(100);
    return {
      result,
      bootMs,
      log: parseServerLog(stdout, `cold-boot child stdout`),
      mode: health.mode,
    };
  } finally {
    child.kill('SIGTERM');
  }
}
