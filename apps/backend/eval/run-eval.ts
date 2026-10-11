/**
 * Labelled eval against a running backend.
 *   npm run eval -- --target http://localhost:3000 --label ours [--split tune|holdout|all] [--smoke]
 * Validates the dataset first (refuses to run on errors), replays sessions, writes reports/eval-*.md
 * (+ history copy + raw predictions for later baseline columns). Exit: 0 ok · 1 smoke gate failed · 2 setup error.
 */
import { parseArgs } from 'node:util';
import { loadAll, type LabelledChunk } from './lib/dataset.js';
import { renderEval, type Baseline } from './lib/eval-report.js';
import { computeMetrics, perProvider } from './lib/eval-metrics.js';
import { replay, type ChunkResult } from './lib/eval-run.js';
import { getHealth, normTarget, Throttle } from './lib/http.js';
import { achievedText, RATE_OPTIONS, ratePlan } from './lib/rate.js';
import { baselineResults, writeRaw } from './lib/raw-store.js';
import { isoStamp, pct, safeLabel, table, writeHistory, writeReport } from './lib/reports.js';
import {
  logKey,
  providerLines,
  providerStats,
  readServerLog,
  type ServerLog,
} from './lib/server-log.js';
import { has, validateDataset } from './lib/validate.js';

/**
 * Smoke gate on LENIENT accuracy (S2b, T8): constant-`neutral` floor on the smoke subset is 6/15 = 40%.
 * 0.60 = 9/15 requires 3 more correct chunks than always answering neutral. Rationale in the S2b handoff.
 */
const SMOKE_MIN_LENIENT = 0.6;

const { values: a } = parseArgs({
  options: {
    target: { type: 'string', default: 'http://localhost:3000' },
    label: { type: 'string', default: 'ours' },
    split: { type: 'string', default: 'tune' },
    smoke: { type: 'boolean', default: false },
    'holdout-ok': { type: 'boolean', default: false },
    ...RATE_OPTIONS,
    concurrency: { type: 'string', default: '4' },
    'timeout-ms': { type: 'string', default: '10000' },
    'server-log': { type: 'string' },
    baseline: { type: 'string', default: 'reference' },
    'min-lenient': { type: 'string', default: String(SMOKE_MIN_LENIENT) },
    'no-latest': { type: 'boolean', default: false },
  },
});

function fail(msg: string): never {
  console.error(`eval: ${msg}`);
  process.exit(2);
}

function selectRows(rows: LabelledChunk[]): { rows: LabelledChunk[]; scope: string } {
  if (a.smoke) return { rows: rows.filter((r) => has(r, 'smoke')), scope: 'smoke subset (tune)' };
  if ((a.split === 'holdout' || a.split === 'all') && !a['holdout-ok'])
    fail('holdout is run once at the end (S8b); pass --holdout-ok to confirm you are not tuning');
  if (a.split === 'all') return { rows, scope: 'all splits' };
  if (a.split !== 'tune' && a.split !== 'holdout') fail(`--split must be tune|holdout|all`);
  return { rows: rows.filter((r) => r.split === a.split), scope: `${a.split} split` };
}

function loadBaseline(label: string, rows: LabelledChunk[]): Baseline | null {
  if (safeLabel(label) === safeLabel(a.label)) return null;
  const b = baselineResults(label, rows);
  return 'missing' in b
    ? { label, missing: b.missing }
    : { label: b.label, metrics: computeMetrics(rows, b.results) };
}

function providerAccuracy(
  log: ServerLog | null,
  rows: LabelledChunk[],
  results: ChunkResult[],
  runId: string,
): string[] {
  if (!log) return [];
  const of = (r: LabelledChunk): string | null =>
    log.byChunk.get(logKey(`${r.session_id}~${runId}`, r.chunk_id))?.provider ?? null;
  const groups = perProvider(rows, results, of);
  return [
    '',
    'Accuracy by answering provider (from the server log):',
    '',
    table(
      ['provider', 'n', 'strict', 'lenient'],
      groups.map((g) => [g.name, String(g.n), pct(g.strict), pct(g.lenient)]),
    ),
  ];
}

async function main(): Promise<void> {
  const { rows: all, errors: parseErrors } = loadAll();
  const v = validateDataset(all, parseErrors);
  if (v.errors.length)
    fail(
      `dataset invalid (${v.errors.length} errors), refusing to run:\n  ${v.errors.join('\n  ')}`,
    );
  const { rows, scope } = selectRows(all);
  const target = normTarget(a.target);
  const health = await getHealth(target);
  if (!health) fail(`no /health at ${target}; start the backend first`);
  let plan;
  try {
    plan = ratePlan(a, health.mode);
  } catch (e) {
    fail(e instanceof Error ? e.message : String(e));
  }
  const rpm = plan.rpm;
  const throttle = new Throttle(rpm);
  const runId = isoStamp()
    .replace(/[-:TZ]/g, '')
    .slice(2);
  const startedAt = new Date().toISOString();
  const t0 = performance.now();
  console.log(
    `eval: ${rows.length} chunks (${scope}) → ${target} [mode ${health.mode}, rpm ${rpm || 'unthrottled'}]`,
  );
  const results = await replay(rows, {
    target,
    runId,
    concurrency: Math.max(1, Number(a.concurrency)),
    throttle,
    timeoutMs: Number(a['timeout-ms']),
  });
  const durationS = (performance.now() - t0) / 1000;
  const healthAfter = (await getHealth(target))?.mode ?? 'unreachable';
  const mode = healthAfter === health.mode ? health.mode : `${health.mode} → ${healthAfter}`;
  const log = a['server-log'] ? readServerLog(a['server-log']) : null;
  if (a['server-log'] && !log)
    console.warn(`eval: server log ${a['server-log']} not found; provider mix not observable`);
  const keys = rows.map((r) => logKey(`${r.session_id}~${runId}`, r.chunk_id));
  const metrics = computeMetrics(rows, results);
  const threshold = Number(a['min-lenient']);
  const smoke = a.smoke
    ? { threshold, pass: metrics.cls.lenient >= threshold && metrics.errors === 0 }
    : null;
  const md = renderEval(
    {
      label: a.label,
      target,
      scope,
      healthMode: mode,
      healthVersion: health.version,
      startedAt,
      durationS,
      runId,
      rateAssumption: plan.assumption,
      rpmAchieved: achievedText(rpm, throttle.achievedRpm()),
      concurrency: Number(a.concurrency),
      providerLines: [
        ...providerLines(log ? providerStats(log, keys) : null, mode),
        ...providerAccuracy(log, rows, results, runId),
      ],
      smoke,
    },
    rows,
    results,
    metrics,
    loadBaseline(a.baseline, rows),
  );
  const written: string[] = [];
  if (a.smoke) written.push(writeReport('eval-smoke.md', md));
  else {
    written.push(
      writeReport(`eval-${safeLabel(a.label)}.md`, md),
      writeHistory(isoStamp(), `eval-${a.label}`, md),
    );
    if (safeLabel(a.label) !== safeLabel(a.baseline) && !a['no-latest'])
      written.push(writeReport('eval-latest.md', md));
    written.push(writeRaw(a.label, health.mode, results));
  }
  const c = metrics.cls;
  console.log(
    `eval: strict ${(100 * c.strict).toFixed(1)}% · lenient ${(100 * c.lenient).toFixed(1)}% (neutral floor ${(100 * metrics.neutralFloor.lenient).toFixed(1)}%) · macro-F1 ${c.macroF1.toFixed(3)} · errors ${metrics.errors}`,
  );
  console.log(`eval: wrote ${written.join(', ')}`);
  if (smoke && !smoke.pass) {
    console.error(
      `eval:smoke FAIL — lenient ${(100 * c.lenient).toFixed(1)}% < ${(100 * threshold).toFixed(1)}% or ${metrics.errors} errors`,
    );
    process.exit(1);
  }
}

await main();
