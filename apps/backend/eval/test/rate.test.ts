import { afterEach, describe, expect, it, vi } from 'vitest';
import { sourcedNumber } from '../lib/env-defaults.js';
import { achievedText, ratePlan } from '../lib/rate.js';

describe('ratePlan (free-tier safety)', () => {
  it('LLM mode derives RPM from the token budget defaults and flags them UNVERIFIED', () => {
    const p = ratePlan({}, 'llm:groq');
    expect(p.rpm).toBe(7); // floor(6000 / 800)
    expect(p.assumption).toContain('UNVERIFIED');
  });

  it('--rpm caps the derived rate but never raises it', () => {
    expect(ratePlan({ rpm: '5' }, 'llm:groq').rpm).toBe(5);
    expect(ratePlan({ rpm: '100' }, 'llm:groq').rpm).toBe(7);
    expect(ratePlan({ tpm: '30000', 'tokens-per-req': '600' }, 'llm:groq').rpm).toBe(50);
  });

  it('heuristic mode is unthrottled unless --rpm or --tpm is given', () => {
    expect(ratePlan({}, 'heuristic').rpm).toBe(0);
    expect(ratePlan({ rpm: '12' }, 'heuristic').rpm).toBe(12);
    expect(ratePlan({ tpm: '1600' }, 'heuristic').rpm).toBe(2);
  });

  it('rejects invalid numbers and never derives 0 RPM', () => {
    expect(() => ratePlan({ tpm: '-1' }, 'llm:groq')).toThrow();
    expect(() => ratePlan({ rpm: 'abc' }, 'heuristic')).toThrow();
    expect(ratePlan({ tpm: '100', 'tokens-per-req': '800' }, 'llm:groq').rpm).toBe(1);
  });

  it('achieved RPM is n/a when unthrottled', () => {
    expect(achievedText(0, 99999)).toBe('n/a (unthrottled)');
    expect(achievedText(7, 6.95)).toBe('7.0');
  });
});

describe('sourcedNumber (flag > env > fallback, with source)', () => {
  afterEach(() => vi.unstubAllEnvs());

  it('reports where the value came from', () => {
    vi.stubEnv('LLM_DEADLINE_MS', '');
    expect(sourcedNumber('LLM_DEADLINE_MS', undefined, 'deadline-ms', 450, [1, 60000])).toEqual({
      value: 450,
      source: 'fallback 450 (LLM_DEADLINE_MS not set in env)',
    });
    vi.stubEnv('LLM_DEADLINE_MS', '300');
    expect(sourcedNumber('LLM_DEADLINE_MS', undefined, 'deadline-ms', 450, [1, 60000])).toEqual({
      value: 300,
      source: 'env LLM_DEADLINE_MS',
    });
    expect(sourcedNumber('LLM_DEADLINE_MS', '200', 'deadline-ms', 450, [1, 60000]).source).toBe(
      '--deadline-ms',
    );
  });

  it('ignores out-of-range env values and rejects out-of-range flags', () => {
    vi.stubEnv('VOLATILITY_THRESHOLD', '7');
    expect(sourcedNumber('VOLATILITY_THRESHOLD', undefined, 'x', 0.6, [0, 1]).value).toBe(0.6);
    expect(() => sourcedNumber('VOLATILITY_THRESHOLD', '2', 'x', 0.6, [0, 1])).toThrow();
  });
});
