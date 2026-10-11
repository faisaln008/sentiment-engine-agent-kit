import { describe, expect, it, vi } from 'vitest';
import type { Classifier, ClassifyInput, ClassifyResult } from '../src/llm/classifier.js';
import { FallbackChain } from '../src/llm/fallback-chain.js';

const input: ClassifyInput = {
  text: 'hello',
  speaker: 'counterpart',
  acoustics: {
    pitch_volatility: 0.3,
    speech_rate_wpm: 150,
    pause_duration_ms: 300,
    volume_intensity: 0.5,
  },
  imputed: [],
};
const verdict = {
  sentiment: 'neutral' as const,
  confidence: 0.5,
  hidden_intent: 'none_detected',
  mitigation: 'x',
  risk: 'low' as const,
};
const good = (provider: string): ClassifyResult => ({ ok: true, verdict, provider, ms: 1 });
const bad = (
  provider: string,
  reason: 'http' | 'bad_json' | 'rate_limited' | 'timeout',
  extra: { status?: number; retryAfterMs?: number } = {},
): ClassifyResult => ({ ok: false, reason, provider, ms: 1, ...extra });

interface Fake extends Classifier {
  calls: number;
}
function fake(
  name: string,
  results: Array<ClassifyResult | (() => Promise<ClassifyResult>)>,
): Fake {
  const f: Fake = {
    name,
    calls: 0,
    classify() {
      f.calls += 1;
      const r = results[Math.min(f.calls - 1, results.length - 1)];
      if (r === undefined) throw new Error('no result');
      return typeof r === 'function' ? r() : Promise.resolve(r);
    },
  };
  return f;
}
const sig = (): AbortSignal => new AbortController().signal;
function chain(
  providers: Classifier[],
  extra: Partial<ConstructorParameters<typeof FallbackChain>[0]> = {},
) {
  let t = 0;
  const c = new FallbackChain({
    providers,
    circuitFailures: 3,
    circuitCooldownMs: 15000,
    maxInflight: 16,
    now: () => t,
    ...extra,
  });
  return { c, advance: (ms: number) => (t += ms) };
}

describe('chain', () => {
  it('chain.429-falls-back', async () => {
    const a = fake('groq', [bad('groq', 'rate_limited', { status: 429, retryAfterMs: 2000 })]);
    const b = fake('gemini', [good('gemini')]);
    const r = await chain([a, b]).c.classify(input, sig());
    expect(r).toMatchObject({ ok: true, provider: 'gemini' });
    expect([a.calls, b.calls]).toEqual([1, 1]);
  });

  it('chain.error-falls-back', async () => {
    const a = fake('groq', [bad('groq', 'http', { status: 503 })]);
    const b = fake('gemini', [good('gemini')]);
    expect(await chain([a, b]).c.classify(input, sig())).toMatchObject({
      ok: true,
      provider: 'gemini',
    });
  });

  it('chain.bad-json-next', async () => {
    const a = fake('groq', [bad('groq', 'bad_json')]);
    const b = fake('gemini', [good('gemini')]);
    expect(await chain([a, b]).c.classify(input, sig())).toMatchObject({
      ok: true,
      provider: 'gemini',
    });
  });

  it('chain.circuit-open-skips: 3 failures open it; skipped instantly; closes after cooldown', async () => {
    const a = fake('groq', [bad('groq', 'http')]);
    const b = fake('gemini', [good('gemini')]);
    const { c, advance } = chain([a, b]);
    for (let i = 0; i < 3; i++) await c.classify(input, sig());
    expect(a.calls).toBe(3);
    await c.classify(input, sig());
    expect(a.calls).toBe(3);
    expect(b.calls).toBe(4);
    advance(15001);
    await c.classify(input, sig());
    expect(a.calls).toBe(4);
  });

  it('chain.circuit cooldown is at least retry-after', async () => {
    const a = fake('groq', [bad('groq', 'rate_limited', { status: 429, retryAfterMs: 40_000 })]);
    const b = fake('gemini', [good('gemini')]);
    const { c, advance } = chain([a, b]);
    for (let i = 0; i < 3; i++) await c.classify(input, sig());
    advance(20_000);
    await c.classify(input, sig());
    expect(a.calls).toBe(3);
    advance(21_000);
    await c.classify(input, sig());
    expect(a.calls).toBe(4);
  });

  it('chain.slow-primary-no-hedge: fallback never called while primary is pending', async () => {
    let release: (r: ClassifyResult) => void = () => undefined;
    const a = fake('groq', [() => new Promise<ClassifyResult>((res) => (release = res))]);
    const b = fake('gemini', [good('gemini')]);
    vi.useFakeTimers();
    try {
      const p = chain([a, b]).c.classify(input, sig());
      await vi.advanceTimersByTimeAsync(10_000);
      expect(b.calls).toBe(0);
      release(good('groq'));
      expect(await p).toMatchObject({ ok: true, provider: 'groq' });
      expect(b.calls).toBe(0);
    } finally {
      vi.useRealTimers();
    }
  });

  it('chain.deadline-heuristic: abort in flight -> timeout, fallback not started, breaker counts it', async () => {
    const ac = new AbortController();
    const a = fake('groq', [
      () =>
        new Promise<ClassifyResult>((res) =>
          ac.signal.addEventListener('abort', () => res(bad('groq', 'timeout'))),
        ),
    ]);
    const b = fake('gemini', [good('gemini')]);
    const { c } = chain([a, b], { circuitFailures: 1 });
    const p = c.classify(input, ac.signal);
    ac.abort();
    expect(await p).toMatchObject({ ok: false, reason: 'timeout' });
    expect(b.calls).toBe(0);
    expect(await c.classify(input, sig())).toMatchObject({ ok: true, provider: 'gemini' });
    expect(a.calls).toBe(1); // breaker (threshold 1) opened on the timeout
  });

  it('chain.all-open-instant-heuristic: nothing called, reason circuit_open', async () => {
    const a = fake('groq', [bad('groq', 'http')]);
    const { c } = chain([a], { circuitFailures: 1 });
    await c.classify(input, sig());
    const t = performance.now();
    expect(await c.classify(input, sig())).toMatchObject({ ok: false, reason: 'circuit_open' });
    expect(performance.now() - t).toBeLessThan(20);
    expect(a.calls).toBe(1);
  });

  it('chain.single-provider: failure is returned (caller uses heuristic); mode reflects provider', async () => {
    const a = fake('gemini', [bad('gemini', 'http')]);
    const { c } = chain([a]);
    expect(await c.classify(input, sig())).toMatchObject({
      ok: false,
      reason: 'http',
      provider: 'gemini',
    });
    expect(c.mode()).toBe('llm:gemini');
    expect(chain([]).c.mode()).toBe('heuristic');
  });

  it('chain.auth-error-disables-provider: 401 -> skipped for good, /health mode recomputed, warn callback', async () => {
    const a = fake('groq', [bad('groq', 'http', { status: 401 })]);
    const b = fake('gemini', [good('gemini')]);
    const disabled: string[] = [];
    const { c } = chain([a, b], { onDisabled: (p, s) => disabled.push(`${p}:${s}`) });
    expect(c.mode()).toBe('llm:groq');
    expect(await c.classify(input, sig())).toMatchObject({ ok: true, provider: 'gemini' });
    expect(c.mode()).toBe('llm:gemini');
    await c.classify(input, sig());
    expect(a.calls).toBe(1);
    expect(disabled).toEqual(['groq:401']);
    const only = chain([fake('groq', [bad('groq', 'http', { status: 403 })])]).c;
    await only.classify(input, sig());
    expect(only.mode()).toBe('heuristic');
  });

  it('chain.inflight-cap-skips: at the cap the provider is skipped, next one answers', async () => {
    let release: (r: ClassifyResult) => void = () => undefined;
    const a = fake('groq', [
      () => new Promise<ClassifyResult>((res) => (release = res)),
      good('groq'),
    ]);
    const b = fake('gemini', [good('gemini')]);
    const { c } = chain([a, b], { maxInflight: 1 });
    const first = c.classify(input, sig());
    expect(await c.classify(input, sig())).toMatchObject({ ok: true, provider: 'gemini' });
    expect(a.calls).toBe(1);
    release(good('groq'));
    await first;
    expect(await c.classify(input, sig())).toMatchObject({ provider: 'groq' });
  });

  it('chain.never-throws: a throwing provider is an http failure and the next one answers', async () => {
    const boom: Classifier = { name: 'groq', classify: () => Promise.reject(new Error('x')) };
    const b = fake('gemini', [good('gemini')]);
    expect(await chain([boom, b]).c.classify(input, sig())).toMatchObject({
      ok: true,
      provider: 'gemini',
    });
  });

  it('breaker.half-open-single-probe: 3 concurrent calls after cooldown -> 1 probe, 2 to the fallback', async () => {
    let release: (r: ClassifyResult) => void = () => undefined;
    const hold = () => new Promise<ClassifyResult>((res) => (release = res));
    const a = fake('groq', [bad('groq', 'http'), bad('groq', 'http'), bad('groq', 'http'), hold]);
    const b = fake('gemini', [good('gemini')]);
    const { c, advance } = chain([a, b]);
    for (let i = 0; i < 3; i++) await c.classify(input, sig());
    advance(15_001);
    const probe = c.classify(input, sig());
    const r2 = await c.classify(input, sig());
    const r3 = await c.classify(input, sig());
    expect([r2, r3]).toEqual([
      expect.objectContaining({ provider: 'gemini' }),
      expect.objectContaining({ provider: 'gemini' }),
    ]);
    expect(a.calls).toBe(4); // 3 failures + exactly one probe
    expect(b.calls).toBe(5);
    release(good('groq'));
    expect(await probe).toMatchObject({ ok: true, provider: 'groq' });
  });

  it('breaker.probe-success-closes', async () => {
    const a = fake('groq', [
      bad('groq', 'http'),
      bad('groq', 'http'),
      bad('groq', 'http'),
      good('groq'),
    ]);
    const b = fake('gemini', [good('gemini')]);
    const { c, advance } = chain([a, b]);
    for (let i = 0; i < 3; i++) await c.classify(input, sig());
    advance(15_001);
    expect(await c.classify(input, sig())).toMatchObject({ ok: true, provider: 'groq' });
    expect(await c.classify(input, sig())).toMatchObject({ ok: true, provider: 'groq' });
    expect(a.calls).toBe(5);
  });

  it('breaker.probe-failure-reopens', async () => {
    const a = fake('groq', [bad('groq', 'http')]);
    const b = fake('gemini', [good('gemini')]);
    const { c, advance } = chain([a, b]);
    for (let i = 0; i < 3; i++) await c.classify(input, sig());
    advance(15_001);
    await c.classify(input, sig()); // probe fails
    await c.classify(input, sig()); // open again, skipped
    expect(a.calls).toBe(4);
  });

  it('breaker.open-warns with retry-after capped at 5 min', async () => {
    const a = fake('groq', [bad('groq', 'rate_limited', { status: 429, retryAfterMs: 3_600_000 })]);
    const opened: Array<{ provider: string; retryAfterMs: number; cooldownMs: number }> = [];
    const { c, advance } = chain([a], {
      onBreakerOpen: (provider, i) => opened.push({ provider, ...i }),
    });
    for (let i = 0; i < 3; i++) await c.classify(input, sig());
    expect(opened).toEqual([{ provider: 'groq', retryAfterMs: 300_000, cooldownMs: 300_000 }]);
    advance(301_000);
    await c.classify(input, sig());
    expect(a.calls).toBe(4);
  });

  it('chain.keeps-first-real-failure over a later skip', async () => {
    const a = fake('groq', [bad('groq', 'rate_limited', { status: 429 })]);
    const b = fake('gemini', [good('gemini')]);
    const { c } = chain([a, b], { circuitFailures: 1 });
    await c.classify(input, sig()); // opens both? only groq failed; gemini ok
    const d = fake('gemini2', [bad('gemini2', 'http')]);
    const two = chain([a, d], { circuitFailures: 1 }).c;
    const r = await two.classify(input, sig());
    expect(r).toMatchObject({ ok: false, reason: 'rate_limited', provider: 'groq' });
    const r2 = await two.classify(input, sig()); // both open: skip kind reported
    expect(r2).toMatchObject({ ok: false, reason: 'circuit_open', skip: 'breaker' });
  });

  it('chain.inflight-released on throw and on abort', async () => {
    const boom: Classifier = { name: 'groq', classify: () => Promise.reject(new Error('x')) };
    const b = fake('gemini', [good('gemini')]);
    const one = chain([boom, b], { maxInflight: 1, circuitFailures: 100 }).c;
    for (let i = 0; i < 3; i++)
      expect(await one.classify(input, sig())).toMatchObject({ provider: 'gemini' });
    const ac = new AbortController();
    const hang = fake('groq', [
      () =>
        new Promise<ClassifyResult>((res) =>
          ac.signal.addEventListener('abort', () => res(bad('groq', 'timeout'))),
        ),
      good('groq'),
    ]);
    const two = chain([hang, b], { maxInflight: 1, circuitFailures: 100 }).c;
    const p = two.classify(input, ac.signal);
    ac.abort();
    await p;
    expect(await two.classify(input, sig())).toMatchObject({ ok: true, provider: 'groq' });
    expect(hang.calls).toBe(2);
  });
});
