import { describe, expect, it } from 'vitest';
import { bootstrapMedian, winnerLine } from '../lib/ab.js';
import { parseServerLog, providerStats, logKey } from '../lib/server-log.js';

describe('A/B helpers', () => {
  it('bootstrap median CI is deterministic and brackets the median', () => {
    const xs = Array.from({ length: 50 }, (_, i) => 200 + i * 2); // 200..298, median 248
    const a = bootstrapMedian(xs, 250);
    const b = bootstrapMedian(xs, 250);
    expect(a).toEqual(b);
    expect(a.median).toBe(248);
    expect(a.lo).toBeLessThanOrEqual(248);
    expect(a.hi).toBeGreaterThanOrEqual(248);
    expect(a.pAtOrAbove).toBeGreaterThan(0.2);
    expect(a.pAtOrAbove).toBeLessThan(0.8);
  });

  it('winner rule: excludes invalid and over-budget arms, prints margin and n', () => {
    const line = winnerLine(
      [
        { name: 'a', macroF1: 0.9, p50: 260, n: 50, validForLatency: true },
        { name: 'b', macroF1: 0.8, p50: 100, n: 50, validForLatency: false },
        { name: 'c', macroF1: 0.7, p50: 249, n: 50, validForLatency: true },
      ],
      250,
    );
    expect(line).toContain('**c**');
    expect(line).toContain('1 ms under budget, n 50');
    expect(line).toContain("author's validity rule");
    expect(
      winnerLine([{ name: 'a', macroF1: 1, p50: 250, n: 5, validForLatency: true }], 250),
    ).toContain('no arm qualifies');
  });

  it('providerStats counts every fallback reason and only matched keys', () => {
    const lines = [
      {
        msg: 'chunk',
        session_id: 's',
        chunk_id: '1',
        provider: 'groq',
        outcome: 'ok',
        finish_reason: 'stop',
      },
      {
        msg: 'chunk',
        session_id: 's',
        chunk_id: '2',
        provider: 'heuristic',
        outcome: 'fallback',
        reason: 'timeout',
      },
      {
        msg: 'chunk',
        session_id: 's',
        chunk_id: '3',
        provider: 'heuristic',
        outcome: 'fallback',
        reason: 'bad_json',
      },
      {
        msg: 'chunk',
        session_id: 'x',
        chunk_id: '9',
        provider: 'heuristic',
        outcome: 'fallback',
        reason: 'rate_limited',
      },
    ];
    const log = parseServerLog(lines.map((l) => JSON.stringify(l)).join('\n'), 'mem');
    const st = providerStats(
      log,
      ['1', '2', '3'].map((c) => logKey('s', c)),
    );
    expect(st.matched).toBe(3);
    expect([...st.reasons]).toEqual([
      ['timeout', 1],
      ['bad_json', 1],
    ]);
    expect(st.timeouts).toBe(1);
    expect(st.rateLimited).toBe(0);
    expect(st.lengthTruncated).toBe(0);
  });
});
