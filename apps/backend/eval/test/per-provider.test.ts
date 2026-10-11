import { describe, expect, it } from 'vitest';
import type { Sentiment, TelemetryResponse } from '@app/contracts';
import type { LabelledChunk } from '../lib/dataset.js';
import { perProvider } from '../lib/eval-metrics.js';
import type { ChunkResult } from '../lib/eval-run.js';

// perProvider reads only these three fields; the rest of the row is irrelevant to it.
const row = (chunk_id: string, expected: Sentiment, acceptable: Sentiment[]): LabelledChunk =>
  ({
    chunk_id,
    expected_sentiment: expected,
    acceptable_sentiments: acceptable,
  }) as unknown as LabelledChunk;
const result = (chunk_id: string, sentiment: Sentiment | null): ChunkResult => ({
  chunk_id,
  inputHash: chunk_id,
  status: sentiment === null ? 500 : 200,
  error: null,
  clientMs: 1,
  response: sentiment === null ? null : ({ sentiment } as TelemetryResponse),
});

describe('perProvider (T25 N4)', () => {
  it('groups by logged provider, sorts names, buckets missing log lines, scores strict and lenient', () => {
    const rows = [
      row('a', 'positive', ['positive']),
      row('b', 'deflecting', ['deflecting', 'neutral']),
      row('c', 'aggressive', ['aggressive']),
      row('d', 'neutral', ['neutral']),
    ];
    const results = [
      result('a', 'positive'),
      result('b', 'neutral'),
      result('c', 'negative'),
      result('d', null),
    ];
    const prov: Record<string, string | null> = { a: 'groq', b: 'groq', c: 'heuristic', d: null };
    const groups = perProvider(rows, results, (r) => prov[r.chunk_id] ?? null);
    expect(groups.map((g) => [g.name, g.n, g.strict, g.lenient])).toEqual([
      ['answered by `groq`', 2, 0.5, 1],
      ['answered by `heuristic`', 1, 0, 0],
      ['answered by `not in log`', 1, 0, 0],
    ]);
  });
});
