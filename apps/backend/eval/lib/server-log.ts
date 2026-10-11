/**
 * Optional provider observation. The response contract has no provider field, so provider mix, fallback,
 * deadline timeouts and 429s are NOT observable via the API. When the operator captures our backend's pino
 * stdout to a file (`npm start > server.log`) and passes `--server-log server.log`, we join the per-chunk
 * info line `{msg:"chunk", chunk_id, session_id, provider, outcome[, reason, finish_reason]}` by session+chunk.
 * Fields the backend does not log yet are reported as "not logged", never guessed.
 */
import { existsSync, readFileSync } from 'node:fs';

export interface ChunkLog {
  provider: string;
  outcome: string;
  reason: string | null;
  finishReason: string | null;
}

export interface ServerLog {
  path: string;
  /** key = `${session_id}\u0000${chunk_id}`; last line wins (duplicates are re-analysed). */
  byChunk: Map<string, ChunkLog>;
  /** Which optional fields appeared at least once (so "0" can be told apart from "not logged"). */
  seen: { reason: boolean; finishReason: boolean };
}

export const logKey = (sessionId: string, chunkId: string): string =>
  `${sessionId}\u0000${chunkId}`;

const str = (v: unknown): string | null => (typeof v === 'string' && v !== '' ? v : null);

/** Reads the file once; non-JSON lines (npm banners, stack traces) are skipped. Null if missing. */
export function readServerLog(path: string): ServerLog | null {
  return existsSync(path) ? parseServerLog(readFileSync(path, 'utf8'), path) : null;
}

/** Parses pino JSON lines from captured stdout text. */
export function parseServerLog(text: string, path: string): ServerLog {
  const byChunk = new Map<string, ChunkLog>();
  const seen = { reason: false, finishReason: false };
  for (const raw of text.split('\n')) {
    if (!raw.startsWith('{')) continue;
    let j: Record<string, unknown>;
    try {
      j = JSON.parse(raw) as Record<string, unknown>;
    } catch {
      continue;
    }
    const sid = str(j['session_id']);
    const cid = str(j['chunk_id']);
    const provider = str(j['provider']);
    if (j['msg'] !== 'chunk' || !sid || !cid || !provider) continue;
    const reason = str(j['reason']);
    const finishReason = str(j['finish_reason']);
    seen.reason ||= 'reason' in j;
    seen.finishReason ||= 'finish_reason' in j;
    byChunk.set(logKey(sid, cid), {
      provider,
      outcome: str(j['outcome']) ?? 'unknown',
      reason,
      finishReason,
    });
  }
  return { path, byChunk, seen };
}

export interface ProviderStats {
  /** Requests of this run that were found in the log. */
  matched: number;
  total: number;
  providers: Map<string, number>;
  outcomes: Map<string, number>;
  /** Fallback reasons as logged (`timeout`, `bad_json`, `rate_limited`, …). */
  reasons: Map<string, number>;
  /** null = field never logged by the backend (not observable), number = observed count. */
  timeouts: number | null;
  rateLimited: number | null;
  lengthTruncated: number | null;
}

/** Aggregates log lines for the given (session_id, chunk_id) keys of one run. */
export function providerStats(log: ServerLog, keys: readonly string[]): ProviderStats {
  const providers = new Map<string, number>();
  const outcomes = new Map<string, number>();
  const reasons = new Map<string, number>();
  let matched = 0;
  let timeouts = 0;
  let rateLimited = 0;
  let length = 0;
  for (const k of keys) {
    const e = log.byChunk.get(k);
    if (!e) continue;
    matched += 1;
    providers.set(e.provider, (providers.get(e.provider) ?? 0) + 1);
    outcomes.set(e.outcome, (outcomes.get(e.outcome) ?? 0) + 1);
    if (e.reason) reasons.set(e.reason, (reasons.get(e.reason) ?? 0) + 1);
    if (e.reason === 'timeout') timeouts += 1;
    if (e.reason === 'rate_limited') rateLimited += 1;
    if (e.finishReason === 'length') length += 1;
  }
  return {
    matched,
    total: keys.length,
    providers,
    outcomes,
    reasons,
    timeouts: log.seen.reason ? timeouts : null,
    rateLimited: log.seen.reason ? rateLimited : null,
    lengthTruncated: log.seen.finishReason ? length : null,
  };
}

/** Markdown lines describing provider observability for a run. */
export function providerLines(stats: ProviderStats | null, healthMode: string): string[] {
  if (!stats)
    return [
      `- Provider per chunk: **not observable via API** (the response contract has no provider field; no \`--server-log\` given).`,
      `- \`/health\` mode during the run: \`${healthMode}\`.`,
    ];
  const pct = (n: number): string =>
    stats.matched ? `${n} (${((100 * n) / stats.matched).toFixed(1)}%)` : String(n);
  const fmt = (m: Map<string, number>): string =>
    [...m].map(([k, n]) => `\`${k}\` ${pct(n)}`).join(', ') || 'none';
  const opt = (n: number | null, field: string): string =>
    n === null ? `not logged by backend (\`${field}\` field absent)` : pct(n);
  const primary = healthMode.startsWith('llm:') ? healthMode.slice(4) : null;
  const sum = (f: (p: string) => boolean): number =>
    [...stats.providers].filter(([p]) => f(p)).reduce((a, [, n]) => a + n, 0);
  const heuristic = sum((p) => p === 'heuristic');
  const fallback = sum((p) => p !== 'heuristic' && p !== 'none' && p !== primary);
  return [
    `- Source: server log, ${stats.matched}/${stats.total} chunks matched. \`/health\` mode: \`${healthMode}\`.`,
    `- Provider mix: ${fmt(stats.providers)}`,
    `- Heuristic answers: ${pct(heuristic)} · fallback-LLM answers: ${primary ? pct(fallback) : `n/a (no LLM primary in /health mode)`}`,
    `- Outcomes: ${fmt(stats.outcomes)}`,
    `- Deadline timeouts: ${opt(stats.timeouts, 'reason')} · provider 429s: ${opt(stats.rateLimited, 'reason')} · \`finish_reason:length\`: ${opt(stats.lengthTruncated, 'finish_reason')}`,
  ];
}
