import {
  TelemetryResponseSchema,
  type TelemetryRequestWire,
  type TelemetryResponse,
} from '@app/contracts';

/** POST one chunk through the Vite proxy; returns a schema-valid response or null (warns). */
export async function postChunk(
  req: TelemetryRequestWire,
  signal?: AbortSignal,
): Promise<TelemetryResponse | null> {
  try {
    const res = await fetch('/api/telemetry/stream', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(req),
      ...(signal ? { signal } : {}),
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
    return parsed.data;
  } catch (err) {
    if (!(err instanceof DOMException && err.name === 'AbortError')) {
      console.warn('stream POST error', err);
    }
    return null;
  }
}
