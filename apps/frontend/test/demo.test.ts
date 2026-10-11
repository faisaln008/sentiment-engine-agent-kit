import { describe, expect, it } from 'vitest';
import { TelemetryRequestWireSchema } from '@app/contracts';
import { buildDemoRequests, DEMO_SCRIPT } from '../src/lib/demo';

describe('demo script', () => {
  it('has >= 8 chunks and every payload parses with TelemetryRequestWireSchema', () => {
    const reqs = buildDemoRequests(1_000);
    expect(reqs.length).toBeGreaterThanOrEqual(8);
    expect(reqs).toHaveLength(DEMO_SCRIPT.length);
    for (const r of reqs) expect(TelemetryRequestWireSchema.safeParse(r).success).toBe(true);
  });
  it('one session, unique chunk ids', () => {
    const reqs = buildDemoRequests();
    expect(new Set(reqs.map((r) => r.session_id)).size).toBe(1);
    expect(new Set(reqs.map((r) => r.chunk_id)).size).toBe(reqs.length);
  });
});
