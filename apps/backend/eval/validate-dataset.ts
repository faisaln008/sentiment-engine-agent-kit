/**
 * Dataset validator (no network, no model): `npx tsx apps/backend/eval/validate-dataset.ts`
 * Checks every line parses, ids unique, timestamps monotonic, split by session, pairs inside one split,
 * smoke subset and risk floors; prints counts + coverage matrix. expected_volatility is human-judged: the ADR-003
 * oracle is compared and disagreements are printed as WARN (evidence for ADR-003), never errors. Exit 1 on any error.
 */
import { RISK_LEVELS, RISK_ORDER, SENTIMENTS, SPEAKERS } from '@app/contracts';
import { bySession, loadAll, type LabelledChunk } from './lib/dataset.js';
import { traceSession, VOLATILITY_THRESHOLD } from './lib/volatility-oracle.js';

const MIN_CELL = 4;
const SMOKE_SIZE = 15;
const BORDERLINE = 0.07;
const errors: string[] = [];
const warnings: string[] = [];
const has = (r: LabelledChunk, t: string): boolean => r.tags.includes(t);
const hasPrefix = (r: LabelledChunk, p: string): boolean => r.tags.some((t) => t.startsWith(p));

function checkStructure(rows: LabelledChunk[], sessions: Map<string, LabelledChunk[]>): void {
  const ids = new Set<string>();
  for (const r of rows) {
    if (ids.has(r.chunk_id)) errors.push(`duplicate chunk_id ${r.chunk_id}`);
    ids.add(r.chunk_id);
    if (!r.acceptable_sentiments.includes(r.expected_sentiment))
      errors.push(`${r.chunk_id}: expected_sentiment not in acceptable_sentiments`);
  }
  for (const [sid, list] of sessions) {
    const splits = new Set(list.map((r) => r.split));
    if (splits.size > 1) errors.push(`session ${sid} spans splits`);
    const fileOrder = rows.filter((r) => r.session_id === sid).map((r) => r.timestamp_ms);
    if (fileOrder.some((t, i) => i > 0 && t <= (fileOrder[i - 1] ?? -1)))
      errors.push(`session ${sid}: timestamps not strictly increasing in file order`);
  }
}

function checkPairs(rows: LabelledChunk[]): string[] {
  const pairs = new Map<string, LabelledChunk[]>();
  for (const r of rows) if (r.pair_id) pairs.set(r.pair_id, [...(pairs.get(r.pair_id) ?? []), r]);
  const lines: string[] = [];
  for (const [id, m] of pairs) {
    if (m.length < 2) errors.push(`pair ${id} has ${m.length} member`);
    if (new Set(m.map((r) => r.split)).size > 1) errors.push(`pair ${id} spans splits`);
    if (new Set(m.map((r) => r.text)).size > 1) errors.push(`pair ${id}: texts differ`);
    const kind = m.every((r) => has(r, 'counterfactual')) ? 'counterfactual' : 'context-flip';
    const labels = m.map((r) => `${r.chunk_id}=${r.expected_sentiment}`).join(', ');
    lines.push(`  ${id.padEnd(18)} ${kind.padEnd(15)} ${labels}`);
  }
  return lines;
}

function checkSmoke(rows: LabelledChunk[], sessions: Map<string, LabelledChunk[]>): number {
  const smoke = rows.filter((r) => has(r, 'smoke'));
  if (smoke.length !== SMOKE_SIZE)
    errors.push(`smoke subset = ${smoke.length}, want ${SMOKE_SIZE}`);
  if (smoke.some((r) => r.split !== 'tune')) errors.push('smoke chunks must be in tune split');
  for (const sid of new Set(smoke.map((r) => r.session_id)))
    if ((sessions.get(sid) ?? []).some((r) => !has(r, 'smoke')))
      errors.push(`smoke session ${sid} is not tagged as a whole (context would break)`);
  return new Set(smoke.map((r) => r.expected_sentiment)).size;
}

interface OracleRow {
  chunk_id: string;
  label: boolean;
  v: number;
}

/** Risk floors on the human labels (aggressive >= high; aggressive + labelled volatility => critical; positive <= medium). */
function checkRiskFloors(rows: LabelledChunk[]): void {
  for (const r of rows) {
    const risk = RISK_ORDER[r.expected_risk];
    if (r.expected_sentiment === 'aggressive' && risk < RISK_ORDER.high)
      errors.push(`${r.chunk_id}: aggressive but risk < high (floor)`);
    if (
      r.expected_sentiment === 'aggressive' &&
      r.expected_volatility &&
      r.expected_risk !== 'critical'
    )
      errors.push(`${r.chunk_id}: aggressive+volatility must be critical`);
    if (r.expected_sentiment === 'positive' && risk > RISK_ORDER.medium)
      errors.push(`${r.chunk_id}: positive but risk > medium (ceiling)`);
  }
}

/**
 * expected_volatility is a HUMAN judgement. The ADR-003 oracle is only compared, never enforced:
 * disagreements are WARNs and are evidence about the formula (ADR-003), not label errors.
 */
function compareOracle(rows: LabelledChunk[], sessions: Map<string, LabelledChunk[]>): OracleRow[] {
  const byId = new Map(rows.map((r) => [r.chunk_id, r]));
  const out: OracleRow[] = [];
  for (const list of sessions.values())
    for (const t of traceSession(list)) {
      const r = byId.get(t.chunk_id);
      if (r) out.push({ chunk_id: t.chunk_id, label: r.expected_volatility, v: t.v });
    }
  return out;
}

function printOracle(trace: OracleRow[]): void {
  const flag = (o: OracleRow): boolean => o.v >= VOLATILITY_THRESHOLD;
  const dis = trace.filter((o) => flag(o) !== o.label);
  const near = trace.filter(
    (o) => flag(o) === o.label && Math.abs(o.v - VOLATILITY_THRESHOLD) < BORDERLINE,
  );
  console.log(`
Formula vs label disagreements (ADR-003 oracle on expected labels, threshold ${VOLATILITY_THRESHOLD})`);
  console.log(`  ${'chunk_id'.padEnd(10)} ${'label'.padEnd(6)} ${'v'.padStart(5)}  formula`);
  for (const o of dis) {
    warnings.push(`${o.chunk_id}: volatility label=${o.label}, formula v=${o.v.toFixed(2)}`);
    console.log(
      `  ${o.chunk_id.padEnd(10)} ${String(o.label).padEnd(6)} ${o.v.toFixed(2).padStart(5)}  ${flag(o)}`,
    );
  }
  const tp = trace.filter((o) => o.label && flag(o)).length;
  console.log(
    `  ${dis.length} disagreements / ${trace.length}; label true ${trace.filter((o) => o.label).length}, formula true ${trace.filter(flag).length}, both ${tp}`,
  );
  for (const o of near)
    warnings.push(
      `${o.chunk_id}: v=${o.v.toFixed(2)} within ${BORDERLINE} of threshold (agrees with label)`,
    );
}

function cell(n: number): string {
  return `${String(n).padStart(3)}${n >= MIN_CELL ? ' ' : '!'}`;
}

function need(name: string, n: number, min = MIN_CELL): string {
  if (n < min) errors.push(`coverage: ${name} = ${n} < ${min}`);
  return `  ${name.padEnd(42)} ${String(n).padStart(3)}${n >= min ? '' : '  < ' + min}`;
}

function printMatrix(rows: LabelledChunk[]): void {
  console.log(`\nSentiment x speaker (expected; "!" = below ${MIN_CELL})`);
  console.log(`  ${''.padEnd(12)}${SPEAKERS.map((s) => s.padStart(12)).join('')}   tune holdout`);
  for (const s of SENTIMENTS) {
    const cells = SPEAKERS.map((sp) => {
      const n = rows.filter((r) => r.expected_sentiment === s && r.speaker === sp).length;
      if (n < MIN_CELL) errors.push(`coverage: ${s} x ${sp} = ${n} < ${MIN_CELL}`);
      return cell(n).padStart(12);
    });
    const t = rows.filter((r) => r.expected_sentiment === s && r.split === 'tune').length;
    const h = rows.filter((r) => r.expected_sentiment === s && r.split === 'holdout').length;
    console.log(
      `  ${s.padEnd(12)}${cells.join('')}   ${String(t).padStart(4)} ${String(h).padStart(7)}`,
    );
  }
  console.log('\nRisk / volatility');
  for (const k of RISK_LEVELS)
    console.log(need(`risk ${k}`, rows.filter((r) => r.expected_risk === k).length));
  console.log(need('volatility true', rows.filter((r) => r.expected_volatility).length));
  console.log(need('volatility false', rows.filter((r) => !r.expected_volatility).length));
}

function printTags(rows: LabelledChunk[]): void {
  const pairCount = (tag: string): number =>
    new Set(rows.filter((r) => has(r, tag) && r.pair_id).map((r) => r.pair_id)).size;
  const brief = rows.filter((r) => has(r, 'brief-pattern'));
  const briefLabels = new Set(brief.map((r) => r.expected_sentiment));
  console.log('\nNuance coverage');
  console.log(need('acoustic:agree', rows.filter((r) => has(r, 'acoustic:agree')).length));
  console.log(
    need('acoustic:contradict', rows.filter((r) => has(r, 'acoustic:contradict')).length),
  );
  console.log(
    need('counterfactual pairs (same text, diff acoustics)', pairCount('counterfactual')),
  );
  console.log(need('context-flip pairs (same text, diff context)', pairCount('context-flip')));
  console.log(
    need('hard-negative chunks', rows.filter((r) => hasPrefix(r, 'hard-negative:')).length),
  );
  console.log(need('injection chunks', rows.filter((r) => has(r, 'injection')).length, 3));
  console.log(need('sudden-shift chunks', rows.filter((r) => has(r, 'sudden-shift')).length));
  console.log(need('brief-pattern distinct labels', briefLabels.size, 3));
  console.log(
    `    brief-pattern: ${brief.map((r) => `${r.chunk_id}=${r.expected_sentiment}`).join(', ')}`,
  );
  const nuance = ['sarcastic', 'deflecting', 'appeasement'];
  const nuanceN = rows.filter(
    (r) => nuance.includes(r.expected_sentiment) || hasPrefix(r, 'contradiction:'),
  ).length;
  console.log(`  nuance subset (sarc/defl/appe + contradiction)   ${String(nuanceN).padStart(3)}`);
}

function main(): void {
  const { rows, errors: parseErrors } = loadAll();
  errors.push(...parseErrors);
  const sessions = bySession(rows);
  checkStructure(rows, sessions);
  const pairLines = checkPairs(rows);
  const smokeLabels = checkSmoke(rows, sessions);
  checkRiskFloors(rows);
  const trace = compareOracle(rows, sessions);
  const count = (s: string) => rows.filter((r) => r.split === s);
  const sess = (s: string) => new Set(count(s).map((r) => r.session_id)).size;
  console.log(`Dataset: ${rows.length} chunks, ${sessions.size} sessions`);
  for (const s of ['tune', 'holdout'])
    console.log(
      `  ${s.padEnd(8)} ${count(s).length} chunks (${((100 * count(s).length) / rows.length).toFixed(1)}%), ${sess(s)} sessions`,
    );
  console.log(
    `  smoke    ${rows.filter((r) => has(r, 'smoke')).length} chunks, ${smokeLabels}/7 labels`,
  );
  console.log(
    `  volatility oracle replayed ${trace.length} chunks (WARN only; labels are human-judged)`,
  );
  if (rows.length < 80) errors.push(`only ${rows.length} chunks (< 80)`);
  if (sessions.size < 10) errors.push(`only ${sessions.size} sessions (< 10)`);
  printMatrix(rows);
  printTags(rows);
  console.log('\nPairs');
  console.log(pairLines.join('\n'));
  printOracle(trace);
  for (const w of warnings) console.log(`WARN  ${w}`);
  for (const e of errors) console.log(`ERROR ${e}`);
  console.log(errors.length ? `\nFAIL (${errors.length} errors)` : '\nOK');
  process.exit(errors.length ? 1 : 0);
}

main();
