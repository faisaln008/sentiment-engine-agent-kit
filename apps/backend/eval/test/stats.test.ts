import { describe, expect, it } from 'vitest';
import type { Sentiment } from '@app/contracts';
import { pool } from '../lib/http.js';
import {
  binary,
  classification,
  constantFloor,
  percentile,
  prf,
  riskMetrics,
  wilson,
  type Prediction,
} from '../lib/stats.js';

const p = (
  expected: Sentiment,
  got: Sentiment | null,
  acceptable: Sentiment[] = [expected],
): Prediction => ({
  expected,
  got,
  acceptable,
});

describe('eval stats', () => {
  it('percentile uses nearest rank', () => {
    const xs = [5, 1, 4, 2, 3, 6, 7, 8, 9, 10];
    expect(percentile(xs, 50)).toBe(5);
    expect(percentile(xs, 95)).toBe(10);
    expect(percentile(xs, 10)).toBe(1);
    expect(percentile([], 50)).toBeNaN();
  });

  it('prf returns 0 for undefined ratios', () => {
    expect(prf(0, 0, 0)).toMatchObject({ precision: 0, recall: 0, f1: 0 });
    expect(prf(2, 2, 0).f1).toBeCloseTo(2 / 3, 10);
  });

  it('classification: strict, lenient, confusion, macro-F1 over present classes, errors counted wrong', () => {
    const r = classification([
      p('positive', 'positive'),
      p('sarcastic', 'negative', ['sarcastic', 'negative']),
      p('neutral', 'neutral'),
      p('neutral', null),
    ]);
    expect(r.strict).toBe(0.5);
    expect(r.lenient).toBe(0.75);
    expect(r.confusion.sarcastic.negative).toBe(1);
    expect(r.confusion.neutral.error).toBe(1);
    // positive F1 1, neutral P1 R.5 => .667, sarcastic 0, negative (predicted once, no support) 0
    expect(r.macroClasses).toBe(4);
    expect(r.macroF1).toBeCloseTo((1 + 2 / 3 + 0 + 0) / 4, 10);
  });

  it('constant floor = share of neutral labels (strict) / acceptable sets containing neutral (lenient)', () => {
    const f = constantFloor(
      [
        p('neutral', 'positive'),
        p('negative', 'negative', ['negative', 'neutral']),
        p('positive', 'positive'),
      ],
      'neutral',
    );
    expect(f.strict).toBeCloseTo(1 / 3, 10);
    expect(f.lenient).toBeCloseTo(2 / 3, 10);
  });

  it('risk MAE is ordinal and ignores failed requests', () => {
    const r = riskMetrics([
      { expected: 'low', got: 'critical' },
      { expected: 'high', got: 'high' },
      { expected: 'medium', got: null },
    ]);
    expect(r).toMatchObject({ n: 2, mae: 1.5, exact: 0.5, bias: 1.5 });
  });

  it('binary counts null as false', () => {
    const b = binary([
      { truth: true, got: true },
      { truth: true, got: null },
      { truth: false, got: true },
      { truth: false, got: false },
    ]);
    expect(b).toMatchObject({ tp: 1, fp: 1, fn: 1, agreement: 0.5, positives: 2 });
  });

  it('wilson interval brackets the point estimate', () => {
    const [lo, hi] = wilson(5, 10);
    expect(lo).toBeCloseTo(0.2366, 3);
    expect(hi).toBeCloseTo(0.7634, 3);
    expect(wilson(0, 0)[0]).toBeNaN();
  });

  it('pool keeps input order and caps concurrency', async () => {
    let now = 0;
    const tasks = [30, 10, 20, 5].map((d, i) => async () => {
      now += 1;
      const seen = now;
      await new Promise((r) => setTimeout(r, d));
      now -= 1;
      return [i, seen] as const;
    });
    const { results, peak } = await pool(tasks, 2);
    expect(results.map((x) => x[0])).toEqual([0, 1, 2, 3]);
    expect(peak).toBe(2);
    expect(Math.max(...results.map((x) => x[1]))).toBeLessThanOrEqual(2);
  });
});
