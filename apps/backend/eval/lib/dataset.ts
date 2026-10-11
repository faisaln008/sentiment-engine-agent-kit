/**
 * Eval dataset loader + label schema (apps/backend/eval/SCHEMA.md). Shared by validate-dataset.ts and run-eval.ts.
 * A row = a valid wire request (TelemetryRequestWireSchema) + label fields.
 */
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { z } from 'zod';
import {
  RiskLevelSchema,
  SentimentSchema,
  TelemetryRequestWireSchema,
  type TelemetryRequestWire,
} from '@app/contracts';

export const SPLITS = ['tune', 'holdout'] as const;
export type Split = (typeof SPLITS)[number];

export const DATASET_DIR = fileURLToPath(new URL('../datasets/', import.meta.url));

/** Label fields; acoustics are required in the dataset so per-speaker baselines are exercised. */
export const LabelledChunkSchema = TelemetryRequestWireSchema.extend({
  acoustic_metadata: z.object({
    pitch_volatility: z.number().min(0).max(1),
    speech_rate_wpm: z.number().positive(),
    pause_duration_ms: z.number().nonnegative(),
    volume_intensity: z.number().min(0).max(1),
  }),
  expected_sentiment: SentimentSchema,
  acceptable_sentiments: z.array(SentimentSchema).min(1),
  expected_risk: RiskLevelSchema,
  expected_volatility: z.boolean(),
  tags: z.array(z.string().min(1)),
  pair_id: z.string().min(1).nullable(),
  rationale: z.string().min(10),
}).strict();
export type LabelledChunk = z.infer<typeof LabelledChunkSchema> & { split: Split; line: number };

export interface LoadResult {
  rows: LabelledChunk[];
  errors: string[];
}

/** Parse one split file; collects per-line errors instead of throwing. */
export function loadSplit(split: Split, dir = DATASET_DIR): LoadResult {
  const rows: LabelledChunk[] = [];
  const errors: string[] = [];
  const lines = readFileSync(`${dir}${split}.jsonl`, 'utf8').split('\n');
  lines.forEach((raw, i) => {
    if (raw.trim() === '') return;
    let json: unknown;
    try {
      json = JSON.parse(raw);
    } catch {
      errors.push(`${split}:${i + 1} invalid JSON`);
      return;
    }
    const r = LabelledChunkSchema.safeParse(json);
    if (!r.success) {
      const msg = r.error.issues.map((x) => `${x.path.join('.')}: ${x.message}`).join('; ');
      errors.push(`${split}:${i + 1} ${msg}`);
      return;
    }
    rows.push({ ...r.data, split, line: i + 1 });
  });
  return { rows, errors };
}

export function loadAll(dir = DATASET_DIR): LoadResult {
  const parts = SPLITS.map((s) => loadSplit(s, dir));
  return { rows: parts.flatMap((p) => p.rows), errors: parts.flatMap((p) => p.errors) };
}

/** Wire payload sent to the backend (label fields stripped). */
export function toRequest(row: LabelledChunk): TelemetryRequestWire {
  const { chunk_id, session_id, timestamp_ms, speaker, text, acoustic_metadata } = row;
  return TelemetryRequestWireSchema.parse({
    chunk_id,
    session_id,
    timestamp_ms,
    speaker,
    text,
    acoustic_metadata,
  });
}

/** Sessions in file order, chunks sorted by timestamp (replay order). */
export function bySession(rows: LabelledChunk[]): Map<string, LabelledChunk[]> {
  const m = new Map<string, LabelledChunk[]>();
  for (const r of rows) m.set(r.session_id, [...(m.get(r.session_id) ?? []), r]);
  for (const list of m.values()) list.sort((a, b) => a.timestamp_ms - b.timestamp_ms);
  return m;
}
