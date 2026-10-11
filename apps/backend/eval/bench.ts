/**
 * Latency bench against a running backend.
 *   npm run bench -- [--target http://localhost:3000] [--label ours] [--quick] [--tpm 6000] [--tokens-per-req 800]
 *                    [--rpm N] [--deadline-ms N] [--server-log file]
 * Full: (a) 200 sequential, (b) 20 sessions × 10 concurrent, (c) cold boot first 5 (spawns dist/server.js)
 *   → reports/bench-latest.md (cited by docs) + reports/history/<ISO>-bench-<label>.md.
 * Quick (gate): (a) 30 sequential, (b) 5 × 4, no cold boot → reports/bench-quick.md ONLY (read by scripts/gate.mjs).
 * Both carry `<!-- metrics {...} -->`. Exit 1 on any non-200/schema-invalid response, 2 on setup errors.
 */
import { parseArgs } from 'node:util';
import { coldBoot, makeChunks, runSessions } from './lib/bench-run.js';
import { renderBench } from './lib/bench-report.js';
import { loadSplit } from './lib/dataset.js';
import { sourcedNumber } from './lib/env-defaults.js';
import { getHealth, normTarget, Throttle } from './lib/http.js';
import { achievedText, RATE_OPTIONS, ratePlan } from './lib/rate.js';
import { isoStamp, ms, writeHistory, writeReport } from './lib/reports.js';
import { providerStats, readServerLog } from './lib/server-log.js';
import { summarize } from './lib/stats.js';

const { values: a } = parseArgs({
  options: {
    target: { type: 'string', default: 'http://localhost:3000' },
    label: { type: 'string', default: 'ours' },
    quick: { type: 'boolean', default: false },
    ...RATE_OPTIONS,
    'server-log': { type: 'string' },
    'deadline-ms': { type: 'string' },
    'timeout-ms': { type: 'string', default: '10000' },
    'cold-port': { type: 'string', default: '3019' },
    'no-cold': { type: 'boolean', default: false },
  },
});

function fail(msg: string): never {
  console.error(`bench: ${msg}`);
  process.exit(2);
}

/** Non-null when provider 429s were observed (needs the backend's `reason` log field, R4). */
function invalidReason(counts: (number | null | undefined)[]): string | null {
  const n = counts.reduce<number>((s, c) => s + (c ?? 0), 0);
  return n > 0 ? `${n} provider 429 (rate_limited) responses observed in the server log` : null;
}

async function main(): Promise<void> {
  const target = normTarget(a.target);
  const health = await getHealth(target);
  if (!health) fail(`no /health at ${target}; start the backend first`);
  const { rows: src, errors } = loadSplit('tune');
  if (errors.length || src.length === 0) fail(`tune split invalid (${errors.length} errors)`);
  let plan, deadline;
  try {
    plan = ratePlan(a, health.mode);
    deadline = sourcedNumber('LLM_DEADLINE_MS', a['deadline-ms'], 'deadline-ms', 450, [1, 60_000]);
  } catch (e) {
    fail(e instanceof Error ? e.message : String(e));
  }
  const throttle = new Throttle(plan.rpm);
  const timeoutMs = Number(a['timeout-ms']);
  const runId = isoStamp()
    .replace(/[-:TZ]/g, '')
    .slice(2);
  const [seqN, sessN, perN] = a.quick ? [30, 5, 4] : [200, 20, 10];
  const startedAt = new Date().toISOString();
  const t0 = performance.now();
  console.log(
    `bench: ${a.quick ? 'quick' : 'full'} → ${target} [mode ${health.mode}, rpm ${plan.rpm || 'unthrottled'}]`,
  );

  const seq = await runSessions(
    `a) sequential, 1 session`,
    target,
    [makeChunks(src, `bench-${runId}-seq`, seqN)],
    1,
    throttle,
    timeoutMs,
    '',
  );
  const conc = await runSessions(
    `b) ${sessN} sessions × ${perN} concurrent`,
    target,
    Array.from({ length: sessN }, (_, k) =>
      makeChunks(src, `bench-${runId}-s${k + 1}`, perN, k * 5),
    ),
    sessN,
    throttle,
    timeoutMs,
    plan.rpm > 0 ? 'RPM throttle limits real concurrency (see peak in-flight)' : '',
  );
  const cold =
    a.quick || a['no-cold']
      ? { skipped: a.quick ? 'quick mode' : '--no-cold' }
      : await coldBoot(src, Number(a['cold-port']), runId, throttle, timeoutMs);
  const scenarios = [seq, conc, ...('result' in cold ? [cold.result] : [])];
  const warm = [...seq.samples, ...conc.samples];
  const wc = summarize(warm.filter((s) => s.error === null).map((s) => s.clientMs));
  const errorsN = scenarios.flatMap((s) => s.samples).filter((s) => s.error !== null).length;
  const modeAfter = (await getHealth(target))?.mode ?? 'unreachable';
  const mode = modeAfter === health.mode ? health.mode : `${health.mode} → ${modeAfter}`;
  const log = a['server-log'] ? readServerLog(a['server-log']) : null;
  const warmProviders = log
    ? providerStats(
        log,
        warm.map((s) => s.key),
      )
    : null;
  const coldView =
    'result' in cold
      ? {
          providers: providerStats(
            cold.log,
            cold.result.samples.map((s) => s.key),
          ),
          mode: cold.mode,
        }
      : null;
  const invalid = invalidReason([warmProviders?.rateLimited, coldView?.providers.rateLimited]);
  const metrics = {
    p50: Math.round(wc.p50),
    p95: Math.round(wc.p95),
    p99: Math.round(wc.p99),
    n: wc.n,
    errors: errorsN,
    scope: 'warm a+b, client-side ms',
    quick: a.quick,
    valid_for_latency: invalid === null,
  };
  const md = renderBench({
    label: a.label,
    quick: a.quick,
    target,
    mode,
    version: health.version,
    startedAt,
    durationS: (performance.now() - t0) / 1000,
    runId,
    rateAssumption: plan.assumption,
    rpmAchieved: achievedText(plan.rpm, throttle.achievedRpm()),
    timeoutMs,
    deadline,
    scenarios,
    coldSkipped: 'skipped' in cold ? cold.skipped : null,
    warm,
    warmProviders,
    cold: coldView,
    invalidReason: invalid,
    metricsJson: JSON.stringify(metrics),
  });
  const written = a.quick
    ? [writeReport('bench-quick.md', md)]
    : [writeReport('bench-latest.md', md), writeHistory(isoStamp(), `bench-${a.label}`, md)];
  console.log(
    `bench: warm client p50 ${ms(wc.p50)} / p95 ${ms(wc.p95)} / p99 ${ms(wc.p99)} ms (n ${wc.n}) · errors ${errorsN}${invalid ? ' · INVALID-FOR-LATENCY' : ''}`,
  );
  console.log(`bench: wrote ${written.join(', ')}`);
  if (errorsN > 0) process.exit(1);
}

await main();
