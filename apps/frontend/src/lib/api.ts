import {
  TelemetryResponseSchema,
  type TelemetryRequestWire,
  type TelemetryResponse,
} from '@app/contracts';

export const POST_TIMEOUT_MS = 3000;

/** POST one chunk through the Vite proxy; returns a schema-valid response or null (warns). */
export async function postChunk(
  req: TelemetryRequestWire,
  signal?: AbortSignal,
): Promise<TelemetryResponse | null> {
  const timeout = AbortSignal.timeout(POST_TIMEOUT_MS);
  try {
    const res = await fetch('/api/telemetry/stream', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(req),
      signal: signal ? AbortSignal.any([signal, timeout]) : timeout,
    });
    if (!res.ok) {
      console.warn('stream POST failed', res.status);
      return null;
    }
    const parsed = TelemetryResponseSchema.safeParse(await res.json());
    if (!parsed.success) {
      console.warn('invalid response dropped', parsed.error.issues.length, 'issues');
      return null;
    }
    if (parsed.data.chunk_id !== req.chunk_id) {
      console.warn('response chunk_id mismatch dropped');
      return null;
    }
    return parsed.data;
  } catch (err) {
    console.warn('stream POST error', err instanceof Error ? err.name : 'unknown');
    return null;
  }
}
