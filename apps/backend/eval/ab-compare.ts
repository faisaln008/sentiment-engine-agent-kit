/**
 * CP1 model A/B report (S3c) from COMMITTED evidence only (reports/raw/*):
 *   npx tsx apps/backend/eval/ab-compare.ts --arm '<name>|<eval label>|<server log jsonl>|<bench report>|<config text>' (×N)
 *     [--extra '<name>|<server log jsonl>|<bench report>|<config text>'] [--notes <md appended verbatim>]
 *     [--deadline-ms 450] [--budget-ms 250]
 * Eval metrics are recomputed from reports/raw/eval-<label>.jsonl on the tune split with the current labels; provider
 * mix, fallback reasons, 429s and finish_reason come from the arm's sanitised server log (one fresh server per arm);
 * bench latency comes from the bench report's `<!-- metrics -->` comment; the median CI is bootstrapped from the
 * server-side latency_ms of the bench chunks in the log. The exact invocation is printed in the report header.
 */
import { existsSync, readFileSync } from 'node:fs';
import { parseArgs } from 'node:util';
import { z } from 'zod';
import { SENTIMENTS } from '@app/contracts';
import { bootstrapMedian, winnerLine } from './lib/ab.js';
import { loadSplit } from './lib/dataset.js';
import { computeMetrics, type EvalMetrics } from './lib/eval-metrics.js';
import { readRaw } from './lib/raw-store.js';
import { num, pct, table, writeReport } from './lib/reports.js';
import {
  providerStats,
  readServerLog,
  type ProviderStats,
  type ServerLog,
} from './lib/server-log.js';

const { values: a } = parseArgs({
  options: {
    arm: { type: 'string', multiple: true, default: [] },
    extra: { type: 'string', multiple: true, default: [] },
    notes: { type: 'string' },
    'deadline-ms': { type: 'string', default: '450' },
    'budget-ms': { type: 'string', default: '250' },
  },
});
const DEADLINE = Number(a['deadline-ms']);
const BUDGET = Number(a['budget-ms']);

const BenchMetricsSchema = z.object({
  p50: z.number(),
  p95: z.number(),
  p99: z.number(),
  n: z.number().int(),
  errors: z.number().int(),
  valid_for_latency: z.boolean(),
});
type BenchMetrics = z.infer<typeof BenchMetricsSchema>;

interface Side {
  name: string;
  config: string;
  eval: EvalMetrics | null;
  /** Chunks answered by an LLM (log provider not `heuristic`/`none`): the fair model comparison. */
  llm: EvalMetrics | null;
  evalLog: ProviderStats | null;
  bench: BenchMetrics;
  benchLog: ProviderStats;
  benchServerMs: number[];
  timeoutMs: number[];
}

function benchMetrics(path: string): BenchMetrics {
  const m = readFileSync(path, 'utf8').match(/<!-- metrics (\{.*\}) -->/);
  if (!m?.[1]) throw new Error(`no metrics comment in ${path}`);
  return BenchMetricsSchema.parse(JSON.parse(m[1]));
}

const isEval = (k: string): boolean => k.split('\u0000')[0]?.includes('~') ?? false;
const isBench = (k: string): boolean => k.startsWith('bench-');
const isLlm = (p: string | undefined): boolean => !!p && p !== 'heuristic' && p !== 'none';

/** latency_ms per log key (the sanitised log keeps it; readServerLog does not). */
function latencies(path: string): Map<string, number> {
  const out = new Map<string, number>();
  for (const l of readFileSync(path, 'utf8').split('\n')) {
    if (!l.startsWith('{')) continue;
    const j = JSON.parse(l) as Record<string, unknown>;
    if (j['msg'] === 'chunk' && typeof j['latency_ms'] === 'number')
      out.set(`${String(j['session_id'])}\u0000${String(j['chunk_id'])}`, j['latency_ms']);
  }
  return out;
}

function load(spec: string, withEval: boolean): Side {
  const p = spec.split('|');
  const [name, label, logPath, benchPath, config] = withEval ? p : [p[0], null, p[1], p[2], p[3]];
  if (!name || !logPath || !benchPath || !config) throw new Error(`bad spec: ${spec}`);
  const log: ServerLog | null = readServerLog(logPath);
  if (!log) throw new Error(`server log ${logPath} missing`);
  const keys = [...log.byChunk.keys()];
  const lat = latencies(logPath);
  let ev: EvalMetrics | null = null;
  let llm: EvalMetrics | null = null;
  if (withEval && label) {
    const store = readRaw(label);
    if (!store) throw new Error(`no raw store for ${label}`);
    const rows = loadSplit('tune').rows;
    const res = rows.flatMap((r) => {
      const x = store.results.get(r.chunk_id);
      if (!x) throw new Error(`${label} lacks ${r.chunk_id}`);
      return [x];
    });
    ev = computeMetrics(rows, res);
    const prov = new Map(
      keys.filter(isEval).map((k) => [k.split('\u0000')[1], log.byChunk.get(k)?.provider]),
    );
    llm = computeMetrics(
      rows.filter((r) => isLlm(prov.get(r.chunk_id))),
      res,
    );
  }
  const timeoutMs = keys
    .filter((k) => log.byChunk.get(k)?.reason === 'timeout')
    .flatMap((k) => lat.get(k) ?? []);
  return {
    name,
    config,
    eval: ev,
    llm,
    evalLog: withEval ? providerStats(log, keys.filter(isEval)) : null,
    bench: benchMetrics(benchPath),
    benchLog: providerStats(log, keys.filter(isBench)),
    benchServerMs: keys.filter(isBench).flatMap((k) => lat.get(k) ?? []),
    timeoutMs,
  };
}

const share = (s: ProviderStats | null, f: (s: ProviderStats) => number | null): string => {
  if (!s) return 'n/a';
  const n = f(s);
  return n === null ? 'not logged' : `${n}/${s.matched} (${pct(s.matched ? n / s.matched : NaN)})`;
};
const reasonText = (s: ProviderStats | null): string =>
  s ? [...s.reasons].map(([k, n]) => `${k} ${n}`).join(', ') || 'none' : 'n/a';
const heur = (s: ProviderStats): number => s.providers.get('heuristic') ?? 0;
const LEN_NOTE = ' (logged only when the LLM answer was used; `bad_json` truncations not counted)';

function benchLatency(s: Side): string {
  const ci = bootstrapMedian(s.benchServerMs, BUDGET);
  const base = `${s.bench.p50} / ${s.bench.p95} / ${s.bench.p99} (n ${s.bench.n})`;
  const civ = `; server-side median ${ci.median} ms, 95% bootstrap CI [${ci.lo}, ${ci.hi}] (n ${ci.n}; dispersion only: the budget is client-side, which adds loopback/HTTP time)`;
  return s.bench.valid_for_latency ? base + civ : `${base} — **INVALID (provider 429)**`;
}

function summaryTable(sides: Side[]): string {
  const row = (label: string, f: (s: Side) => string): string[] => [label, ...sides.map(f)];
  const ev = (f: (m: EvalMetrics) => string) => (s: Side) => (s.eval ? f(s.eval) : '—');
  const lm = (f: (m: EvalMetrics) => string) => (s: Side) => (s.llm ? f(s.llm) : '—');
  return table(
    ['', ...sides.map((s) => `**${s.name}**`)],
    [
      row('Config', (s) => s.config),
      row(
        'Eval n (tune)',
        ev((m) => String(m.n)),
      ),
      row(
        'Eval macro-F1 (classes averaged)',
        ev((m) => `${num(m.cls.macroF1)} (${m.cls.macroClasses})`),
      ),
      row(
        'Eval strict / lenient',
        ev((m) => `${pct(m.cls.strict)} / ${pct(m.cls.lenient)}`),
      ),
      row(
        'Nuance subset strict / lenient (n)',
        ev((m) => `${pct(m.nuance.strict)} / ${pct(m.nuance.lenient)} (${m.nuance.n})`),
      ),
      row(
        '**LLM-answered** n',
        lm((m) => String(m.n)),
      ),
      row(
        '**LLM-answered macro-F1** (classes averaged)',
        lm((m) => `${num(m.cls.macroF1)} (${m.cls.macroClasses})`),
      ),
      row(
        'LLM-answered strict / lenient',
        lm((m) => `${pct(m.cls.strict)} / ${pct(m.cls.lenient)}`),
      ),
      row(
        'LLM-answered nuance strict / lenient (n)',
        lm((m) => `${pct(m.nuance.strict)} / ${pct(m.nuance.lenient)} (${m.nuance.n})`),
      ),
      row('Eval heuristic answers', (s) => share(s.evalLog, heur)),
      row('Eval fallback reasons (all)', (s) => reasonText(s.evalLog)),
      row('Eval deadline timeouts', (s) => share(s.evalLog, (x) => x.timeouts)),
      row(
        'Eval `finish_reason:length`',
        (s) => share(s.evalLog, (x) => x.lengthTruncated) + LEN_NOTE,
      ),
      row('Eval provider 429s', (s) => share(s.evalLog, (x) => x.rateLimited)),
      row(
        'Eval-observed client p50 / p95 ms (throttled eval, NOT a bench)',
        ev((m) => `${Math.round(m.client.p50)} / ${Math.round(m.client.p95)} (n ${m.client.n})`),
      ),
      row('Bench quick client p50 / p95 / p99 ms', benchLatency),
      row('Bench heuristic answers', (s) => share(s.benchLog, heur)),
      row('Bench fallback reasons (all)', (s) => reasonText(s.benchLog)),
      row('Bench deadline timeouts', (s) => share(s.benchLog, (x) => x.timeouts)),
      row(
        'Bench `finish_reason:length`',
        (s) => share(s.benchLog, (x) => x.lengthTruncated) + LEN_NOTE,
      ),
      row('Bench provider 429s', (s) => share(s.benchLog, (x) => x.rateLimited)),
      row('Server latency_ms of deadline timeouts (min–max)', (s) =>
        s.timeoutMs.length
          ? `${Math.min(...s.timeoutMs)}–${Math.max(...s.timeoutMs)} (n ${s.timeoutMs.length})`
          : 'none',
      ),
    ],
  );
}

/** Per-arm support; "—" for classes outside that arm's macro set (no support and no predictions). */
function perClass(sides: Side[], pick: (s: Side) => EvalMetrics | null): string {
  const ev = sides.filter((s) => pick(s));
  const cell = (m: EvalMetrics | null, c: string): string => {
    const x = m?.cls.perClass.find((k) => k.label === c);
    if (!x) return '—';
    return x.support === 0 && x.predicted === 0 ? `— (n 0)` : `${num(x.f1)} (n ${x.support})`;
  };
  return table(
    ['Class', ...ev.map((s) => `${s.name} F1 (support)`)],
    [
      ...SENTIMENTS.map((c) => [c, ...ev.map((s) => cell(pick(s), c))]),
      ['classes in macro-F1', ...ev.map((s) => String(pick(s)?.cls.macroClasses ?? '—'))],
    ],
  );
}

const arms = (a.arm ?? []).map((s) => load(s, true));
const extras = (a.extra ?? []).map((s) => load(s, false));
if (a.notes && !existsSync(a.notes)) throw new Error(`--notes file not found: ${a.notes}`);
const quote = (s: string): string => (/^[\w./:=-]+$/.test(s) ? s : `'${s.replace(/'/g, `'\\''`)}'`);
const invocation = `npx tsx apps/backend/eval/ab-compare.ts ${process.argv.slice(2).map(quote).join(' ')}`;
const winner = winnerLine(
  arms.flatMap((s) =>
    s.eval
      ? [
          {
            name: s.name,
            macroF1: s.eval.cls.macroF1,
            p50: s.bench.p50,
            n: s.bench.n,
            validForLatency: s.bench.valid_for_latency,
          },
        ]
      : [],
  ),
  BUDGET,
);
const md = `# CP1 model A/B (S3c)

Generated ${new Date().toISOString()} from committed evidence only (eval raw stores, sanitised server logs, bench reports under \`reports/raw/\`). Reproduce:

\`\`\`
${invocation}
\`\`\`

Per-arm eval reports: ${arms.map((s) => `\`reports/eval-ab-${s.name}.md\``).join(', ')}.

## Primary result (LLM_DEADLINE_MS ${DEADLINE} as set for each arm server; see the timeout latency row)
${summaryTable(arms)}

${winner}

## Per-class F1 (tune, all chunks)
${perClass(arms, (s) => s.eval)}

## Per-class F1 (LLM-answered chunks only; support differs per arm)
${perClass(arms, (s) => s.llm)}
${extras.length ? `\n## Extra bench-only runs (re-runs / variants; see notes)\n${summaryTable(extras)}\n` : ''}`;
const notes = a.notes ? `\n${readFileSync(a.notes, 'utf8')}` : '';
console.log(`ab-compare: wrote ${writeReport('ab-cp1.md', md + notes)}`);
