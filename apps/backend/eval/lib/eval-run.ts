/**
 * Eval replay (I/O; metrics live in eval-metrics.ts). Sessions run in parallel (bounded, RPM-throttled); chunks in a session
 * are sent sequentially in timestamp order so the backend's context/baselines see a realistic stream.
 */
import { createHash } from 'node:crypto';
import type { TelemetryResponse } from '@app/contracts';
import { bySession, toRequest, type LabelledChunk } from './dataset.js';
import { pool, postChunk, type Throttle } from './http.js';

export interface ChunkResult {
  chunk_id: string;
  /** sha1 over this session's inputs up to and including this chunk (context-sensitive). */
  inputHash: string;
  status: number;
  error: string | null;
  clientMs: number;
  response: TelemetryResponse | null;
}

/** Session-prefix hash: a baseline prediction is reusable only if text/acoustics/order up to it are unchanged. */
export function inputHashes(rows: readonly LabelledChunk[]): Map<string, string> {
  const out = new Map<string, string>();
  for (const list of bySession([...rows]).values()) {
    const h = createHash('sha1');
    for (const r of list) {
      const { session_id, speaker, text, acoustic_metadata, timestamp_ms } = r;
      h.update(JSON.stringify({ session_id, speaker, text, acoustic_metadata, timestamp_ms }));
      out.set(r.chunk_id, h.copy().digest('hex').slice(0, 16));
    }
  }
  return out;
}

export interface RunOptions {
  target: string;
  runId: string;
  concurrency: number;
  throttle: Throttle;
  timeoutMs: number;
}

/** Replays `rows`; session ids are namespaced per run so repeated runs never share backend session state. */
export async function replay(
  rows: readonly LabelledChunk[],
  o: RunOptions,
): Promise<ChunkResult[]> {
  const hashes = inputHashes(rows);
  const sessions = [...bySession([...rows]).values()];
  const tasks = sessions.map((list) => async (): Promise<ChunkResult[]> => {
    const out: ChunkResult[] = [];
    for (const r of list) {
      await o.throttle.acquire();
      const body = { ...toRequest(r), session_id: `${r.session_id}~${o.runId}` };
      const res = await postChunk(o.target, body, o.timeoutMs);
      out.push({
        chunk_id: r.chunk_id,
        inputHash: hashes.get(r.chunk_id) ?? '',
        status: res.status,
        error: res.error,
        clientMs: res.clientMs,
        response: res.response,
      });
    }
    return out;
  });
  const { results } = await pool(tasks, o.concurrency);
  return results.flat();
}
