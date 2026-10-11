/**
 * Dataset validator (no network, no model): `npx tsx apps/backend/eval/validate-dataset.ts`
 * Checks live in lib/validate.ts (also run by run-eval.ts at start-up); this file only prints.
 * Prints counts + coverage matrix + the ADR-003 formula-vs-label disagreement table (WARN only). Exit 1 on any error.
 */
import { SENTIMENTS, SPEAKERS } from '@app/contracts';
import { bySession, loadAll, type LabelledChunk } from './lib/dataset.js';
import {
  has,
  isNuance,
  MIN_CELL,
  validateDataset,
  type Coverage,
  type OracleRow,
  type PairInfo,
} from './lib/validate.js';
import { VOLATILITY_THRESHOLD, VOLATILITY_THRESHOLD_SOURCE } from './lib/volatility-oracle.js';

const line = (k: Coverage): string =>
  `  ${k.name.padEnd(42)} ${String(k.n).padStart(3)}${k.n >= k.min ? '' : '  < ' + k.min}`;
const cov = (all: Coverage[], name: string): Coverage =>
  all.find((k) => k.name === name) ?? { name, n: 0, min: 0 };

function printMatrix(rows: LabelledChunk[], coverage: Coverage[]): void {
  console.log(`\nSentiment x speaker (expected; "!" = below ${MIN_CELL})`);
  console.log(`  ${''.padEnd(12)}${SPEAKERS.map((s) => s.padStart(12)).join('')}   tune holdout`);
  for (const s of SENTIMENTS) {
    const cells = SPEAKERS.map((sp) => {
      const n = cov(coverage, `${s} x ${sp}`).n;
      return `${String(n).padStart(3)}${n >= MIN_CELL ? ' ' : '!'}`.padStart(12);
    });
    const t = rows.filter((r) => r.expected_sentiment === s && r.split === 'tune').length;
    const h = rows.filter((r) => r.expected_sentiment === s && r.split === 'holdout').length;
    console.log(
      `  ${s.padEnd(12)}${cells.join('')}   ${String(t).padStart(4)} ${String(h).padStart(7)}`,
    );
  }
  console.log('\nRisk / volatility');
  for (const k of coverage.filter((c) => c.name.startsWith('risk ') || c.name.startsWith('vol')))
    console.log(line(k));
}

function printTags(rows: LabelledChunk[], coverage: Coverage[]): void {
  console.log('\nNuance coverage');
  const names = [
    'acoustic:agree',
    'acoustic:contradict',
    'counterfactual pairs (same text, diff acoustics)',
    'context-flip pairs (same text, diff context)',
    'hard-negative chunks',
    'injection chunks',
    'sudden-shift chunks',
    'brief-pattern distinct labels',
  ];
  for (const n of names) console.log(line(cov(coverage, n)));
  const brief = rows.filter((r) => has(r, 'brief-pattern'));
  console.log(
    `    brief-pattern: ${brief.map((r) => `${r.chunk_id}=${r.expected_sentiment}`).join(', ')}`,
  );
  const nuanceN = rows.filter(isNuance).length;
  console.log(`  nuance subset (sarc/defl/appe + contradiction)   ${String(nuanceN).padStart(3)}`);
}

function printPairs(pairs: PairInfo[]): void {
  console.log('\nPairs');
  for (const p of pairs) {
    const labels = p.members.map((r) => `${r.chunk_id}=${r.expected_sentiment}`).join(', ');
    console.log(`  ${p.id.padEnd(18)} ${p.kind.padEnd(15)} ${labels}`);
  }
}

function printOracle(trace: OracleRow[]): void {
  const flag = (o: OracleRow): boolean => o.v >= VOLATILITY_THRESHOLD;
  const dis = trace.filter((o) => flag(o) !== o.label);
  console.log(`
Formula vs label disagreements (ADR-003 oracle on expected labels, threshold ${VOLATILITY_THRESHOLD}${VOLATILITY_THRESHOLD_SOURCE.startsWith('fallback') ? '' : `, ${VOLATILITY_THRESHOLD_SOURCE}`})`);
  console.log(`  ${'chunk_id'.padEnd(10)} ${'label'.padEnd(6)} ${'v'.padStart(5)}  formula`);
  for (const o of dis)
    console.log(
      `  ${o.chunk_id.padEnd(10)} ${String(o.label).padEnd(6)} ${o.v.toFixed(2).padStart(5)}  ${flag(o)}`,
    );
  const tp = trace.filter((o) => o.label && flag(o)).length;
  console.log(
    `  ${dis.length} disagreements / ${trace.length}; label true ${trace.filter((o) => o.label).length}, formula true ${trace.filter(flag).length}, both ${tp}`,
  );
}

function main(): void {
  const { rows, errors: parseErrors } = loadAll();
  const v = validateDataset(rows, parseErrors);
  const sessions = bySession(rows);
  const count = (s: string): LabelledChunk[] => rows.filter((r) => r.split === s);
  const sess = (s: string): number => new Set(count(s).map((r) => r.session_id)).size;
  console.log(`Dataset: ${rows.length} chunks, ${sessions.size} sessions`);
  for (const s of ['tune', 'holdout'])
    console.log(
      `  ${s.padEnd(8)} ${count(s).length} chunks (${((100 * count(s).length) / rows.length).toFixed(1)}%), ${sess(s)} sessions`,
    );
  console.log(
    `  smoke    ${rows.filter((r) => has(r, 'smoke')).length} chunks, ${v.smokeLabels}/7 labels`,
  );
  console.log(
    `  volatility oracle replayed ${v.oracle.length} chunks (WARN only; labels are human-judged)`,
  );
  printMatrix(rows, v.coverage);
  printTags(rows, v.coverage);
  printPairs(v.pairs);
  printOracle(v.oracle);
  for (const w of v.warnings) console.log(`WARN  ${w}`);
  for (const e of v.errors) console.log(`ERROR ${e}`);
  console.log(v.errors.length ? `\nFAIL (${v.errors.length} errors)` : '\nOK');
  process.exit(v.errors.length ? 1 : 0);
}

main();
