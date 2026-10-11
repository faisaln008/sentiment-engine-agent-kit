/**
 * Per-label raw predictions, `reports/raw/eval-<label>.jsonl`: line 1 = meta, then one ChunkResult per line.
 * Used to render a baseline column for any later run on the same rows (metrics are recomputed with the CURRENT
 * labels; a stored prediction is reused only if its session-prefix input hash still matches).
 */
import { existsSync, readFileSync } from 'node:fs';
import { z } from 'zod';
import { TelemetryResponseSchema } from '@app/contracts';
import type { LabelledChunk } from './dataset.js';
import { inputHashes, type ChunkResult } from './eval-run.js';
import { REPORTS_DIR, safeLabel, writeReport } from './reports.js';

const MetaSchema = z.object({ label: z.string(), updatedAt: z.string(), healthMode: z.string() });
const ResultSchema = z.object({
  chunk_id: z.string(),
  inputHash: z.string(),
  status: z.number(),
  error: z.string().nullable(),
  clientMs: z.number(),
  response: TelemetryResponseSchema.nullable(),
});
export type RawMeta = z.infer<typeof MetaSchema>;

const rel = (label: string): string => `raw/eval-${safeLabel(label)}.jsonl`;

export function readRaw(
  label: string,
): { meta: RawMeta; results: Map<string, ChunkResult> } | null {
  const p = `${REPORTS_DIR}${rel(label)}`;
  if (!existsSync(p)) return null;
  const [head, ...lines] = readFileSync(p, 'utf8')
    .split('\n')
    .filter((l) => l.trim() !== '');
  const meta = MetaSchema.parse(JSON.parse(head ?? '{}'));
  const results = new Map<string, ChunkResult>();
  for (const l of lines) {
    const r = ResultSchema.parse(JSON.parse(l));
    results.set(r.chunk_id, r);
  }
  return { meta, results };
}

/** Merges into the existing store when the backend mode is unchanged; otherwise starts fresh. */
export function writeRaw(
  label: string,
  healthMode: string,
  results: readonly ChunkResult[],
): string {
  const prev = readRaw(label);
  const merged = new Map(prev && prev.meta.healthMode === healthMode ? prev.results : []);
  for (const r of results) merged.set(r.chunk_id, r);
  const meta: RawMeta = { label, updatedAt: new Date().toISOString(), healthMode };
  const body = [meta, ...[...merged.values()].sort((x, y) => x.chunk_id.localeCompare(y.chunk_id))]
    .map((x) => JSON.stringify(x))
    .join('\n');
  return writeReport(rel(label), `${body}\n`);
}

/** Stored predictions for exactly `rows`, or the reason they cannot be used. */
export function baselineResults(
  label: string,
  rows: readonly LabelledChunk[],
): { label: string; results: ChunkResult[] } | { missing: string } {
  const store = readRaw(label);
  if (!store) return { missing: `no reports/${rel(label)}; run eval with --label ${label}` };
  const hashes = inputHashes(rows);
  const out: ChunkResult[] = [];
  for (const r of rows) {
    const x = store.results.get(r.chunk_id);
    if (!x || x.inputHash !== hashes.get(r.chunk_id))
      return {
        missing: `${r.chunk_id} missing or its inputs changed since the ${label} run; re-run it`,
      };
    out.push(x);
  }
  return { label: `${store.meta.label} (${store.meta.healthMode})`, results: out };
}
