import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { TelemetryRequestWire } from '@app/contracts';
import { postChunk } from '../src/lib/api';

const req: TelemetryRequestWire = {
  chunk_id: 'c1',
  session_id: 's',
  timestamp_ms: 1,
  speaker: 'candidate',
  text: 'hello',
};
const good = {
  chunk_id: 'c1',
  processing_latency_ms: 3,
  sentiment: 'neutral',
  confidence: 0.5,
  volatility_flag: false,
  hidden_intent: 'none',
  mitigation_suggestion: 'keep going',
  risk_level: 'low',
};

function stub(res: Response | Error) {
  const f = vi.fn<typeof fetch>(() =>
    res instanceof Error ? Promise.reject(res) : Promise.resolve(res),
  );
  vi.stubGlobal('fetch', f);
  return f;
}
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });

describe('postChunk', () => {
  beforeEach(() => {
    vi.spyOn(console, 'warn').mockImplementation(() => undefined);
  });
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it('returns a valid response and posts to the proxy path', async () => {
    const f = stub(json(good));
    expect(await postChunk(req)).toEqual(good);
    expect(f.mock.calls[0]?.[0]).toBe('/api/telemetry/stream');
  });
  it('drops an extra key', async () => {
    stub(json({ ...good, extra: 1 }));
    expect(await postChunk(req)).toBeNull();
  });
  it('drops a missing key', async () => {
    const rest: Record<string, unknown> = { ...good };
    delete rest['risk_level'];
    stub(json(rest));
    expect(await postChunk(req)).toBeNull();
  });
  it('drops HTTP 500', async () => {
    stub(json({ error: 'x' }, 500));
    expect(await postChunk(req)).toBeNull();
  });
  it('drops non-JSON body', async () => {
    stub(new Response('<html>', { status: 200 }));
    expect(await postChunk(req)).toBeNull();
  });
  it('drops a mismatched chunk_id', async () => {
    stub(json({ ...good, chunk_id: 'other' }));
    expect(await postChunk(req)).toBeNull();
  });
  it('returns null on network error', async () => {
    stub(new TypeError('network'));
    expect(await postChunk(req)).toBeNull();
  });
});
