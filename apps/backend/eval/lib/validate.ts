/**
 * Dataset checks shared by `validate-dataset.ts` (prints) and `run-eval.ts` (refuses to run on errors).
 * Pure: no console output, no process.exit. expected_volatility is human-judged; the ADR-003 oracle is
 * only compared (WARN), never enforced.
 */
import { RISK_LEVELS, RISK_ORDER, SENTIMENTS, SPEAKERS } from '@app/contracts';
import { bySession, type LabelledChunk } from './dataset.js';
import { traceSession, VOLATILITY_THRESHOLD } from './volatility-oracle.js';

export const MIN_CELL = 4;
export const SMOKE_SIZE = 15;
export const BORDERLINE = 0.07;
export const NUANCE_LABELS: readonly string[] = ['sarcastic', 'deflecting', 'appeasement'];

export const has = (r: LabelledChunk, t: string): boolean => r.tags.includes(t);
export const hasPrefix = (r: LabelledChunk, p: string): boolean =>
  r.tags.some((t) => t.startsWith(p));
/** Nuance subset: sarcastic/deflecting/appeasement or a `contradiction:*` tag (eval-methodology skill). */
export const isNuance = (r: LabelledChunk): boolean =>
  NUANCE_LABELS.includes(r.expected_sentiment) || hasPrefix(r, 'contradiction:');

export interface OracleRow {
  chunk_id: string;
  label: boolean;
  v: number;
}
export interface PairInfo {
  id: string;
  kind: 'counterfactual' | 'context-flip';
  members: LabelledChunk[];
}
export interface Coverage {
  name: string;
  n: number;
  min: number;
}
export interface ValidationResult {
  errors: string[];
  warnings: string[];
  pairs: PairInfo[];
  coverage: Coverage[];
  oracle: OracleRow[];
  smokeLabels: number;
}

function checkStructure(rows: LabelledChunk[], errors: string[]): void {
  const ids = new Set<string>();
  for (const r of rows) {
    if (ids.has(r.chunk_id)) errors.push(`duplicate chunk_id ${r.chunk_id}`);
    ids.add(r.chunk_id);
    if (!r.acceptable_sentiments.includes(r.expected_sentiment))
      errors.push(`${r.chunk_id}: expected_sentiment not in acceptable_sentiments`);
  }
  for (const sid of new Set(rows.map((r) => r.session_id))) {
    const list = rows.filter((r) => r.session_id === sid);
    if (new Set(list.map((r) => r.split)).size > 1) errors.push(`session ${sid} spans splits`);
    const ts = list.map((r) => r.timestamp_ms);
    if (ts.some((t, i) => i > 0 && t <= (ts[i - 1] ?? -1)))
      errors.push(`session ${sid}: timestamps not strictly increasing in file order`);
  }
}

function checkPairs(rows: LabelledChunk[], errors: string[]): PairInfo[] {
  const pairs = new Map<string, LabelledChunk[]>();
  for (const r of rows) if (r.pair_id) pairs.set(r.pair_id, [...(pairs.get(r.pair_id) ?? []), r]);
  return [...pairs].map(([id, m]) => {
    if (m.length < 2) errors.push(`pair ${id} has ${m.length} member`);
    if (new Set(m.map((r) => r.split)).size > 1) errors.push(`pair ${id} spans splits`);
    if (new Set(m.map((r) => r.text)).size > 1) errors.push(`pair ${id}: texts differ`);
    const kind = m.every((r) => has(r, 'counterfactual')) ? 'counterfactual' : 'context-flip';
    return { id, kind, members: m };
  });
}

function checkSmoke(rows: LabelledChunk[], errors: string[]): number {
  const smoke = rows.filter((r) => has(r, 'smoke'));
  if (smoke.length !== SMOKE_SIZE)
    errors.push(`smoke subset = ${smoke.length}, want ${SMOKE_SIZE}`);
  if (smoke.some((r) => r.split !== 'tune')) errors.push('smoke chunks must be in tune split');
  for (const sid of new Set(smoke.map((r) => r.session_id)))
    if (rows.some((r) => r.session_id === sid && !has(r, 'smoke')))
      errors.push(`smoke session ${sid} is not tagged as a whole (context would break)`);
  return new Set(smoke.map((r) => r.expected_sentiment)).size;
}

/** Risk floors on the human labels (aggressive >= high; aggressive + labelled volatility => critical; positive <= medium). */
function checkRiskFloors(rows: LabelledChunk[], errors: string[]): void {
  for (const r of rows) {
    const risk = RISK_ORDER[r.expected_risk];
    const aggr = r.expected_sentiment === 'aggressive';
    if (aggr && risk < RISK_ORDER.high)
      errors.push(`${r.chunk_id}: aggressive but risk < high (floor)`);
    if (aggr && r.expected_volatility && r.expected_risk !== 'critical')
      errors.push(`${r.chunk_id}: aggressive+volatility must be critical`);
    if (r.expected_sentiment === 'positive' && risk > RISK_ORDER.medium)
      errors.push(`${r.chunk_id}: positive but risk > medium (ceiling)`);
  }
}

function compareOracle(rows: LabelledChunk[], warnings: string[]): OracleRow[] {
  const byId = new Map(rows.map((r) => [r.chunk_id, r]));
  const out: OracleRow[] = [];
  for (const list of bySession(rows).values())
    for (const t of traceSession(list)) {
      const r = byId.get(t.chunk_id);
      if (r) out.push({ chunk_id: t.chunk_id, label: r.expected_volatility, v: t.v });
    }
  for (const o of out) {
    const flag = o.v >= VOLATILITY_THRESHOLD;
    if (flag !== o.label)
      warnings.push(`${o.chunk_id}: volatility label=${o.label}, formula v=${o.v.toFixed(2)}`);
    else if (Math.abs(o.v - VOLATILITY_THRESHOLD) < BORDERLINE)
      warnings.push(
        `${o.chunk_id}: v=${o.v.toFixed(2)} within ${BORDERLINE} of threshold (agrees with label)`,
      );
  }
  return out;
}

/** Coverage cells with their minimum (eval-methodology skill); below-minimum cells are errors. */
export function coverageOf(rows: LabelledChunk[], pairs: PairInfo[]): Coverage[] {
  const c = (name: string, n: number, min = MIN_CELL): Coverage => ({ name, n, min });
  const count = (f: (r: LabelledChunk) => boolean): number => rows.filter(f).length;
  const cells: Coverage[] = [];
  for (const s of SENTIMENTS)
    for (const sp of SPEAKERS)
      cells.push(
        c(
          `${s} x ${sp}`,
          count((r) => r.expected_sentiment === s && r.speaker === sp),
        ),
      );
  for (const k of RISK_LEVELS)
    cells.push(
      c(
        `risk ${k}`,
        count((r) => r.expected_risk === k),
      ),
    );
  cells.push(
    c(
      'volatility true',
      count((r) => r.expected_volatility),
    ),
  );
  cells.push(
    c(
      'volatility false',
      count((r) => !r.expected_volatility),
    ),
  );
  cells.push(
    c(
      'acoustic:agree',
      count((r) => has(r, 'acoustic:agree')),
    ),
  );
  cells.push(
    c(
      'acoustic:contradict',
      count((r) => has(r, 'acoustic:contradict')),
    ),
  );
  const pairN = (k: PairInfo['kind']): number => pairs.filter((p) => p.kind === k).length;
  cells.push(c('counterfactual pairs (same text, diff acoustics)', pairN('counterfactual')));
  cells.push(c('context-flip pairs (same text, diff context)', pairN('context-flip')));
  cells.push(
    c(
      'hard-negative chunks',
      count((r) => hasPrefix(r, 'hard-negative:')),
    ),
  );
  cells.push(
    c(
      'injection chunks',
      count((r) => has(r, 'injection')),
      3,
    ),
  );
  cells.push(
    c(
      'sudden-shift chunks',
      count((r) => has(r, 'sudden-shift')),
    ),
  );
  const brief = new Set(
    rows.filter((r) => has(r, 'brief-pattern')).map((r) => r.expected_sentiment),
  );
  cells.push(c('brief-pattern distinct labels', brief.size, 3));
  return cells;
}

/** All checks over the FULL dataset (both splits). Errors block eval runs; warnings never do. */
export function validateDataset(rows: LabelledChunk[], parseErrors: string[]): ValidationResult {
  const errors = [...parseErrors];
  const warnings: string[] = [];
  checkStructure(rows, errors);
  const pairs = checkPairs(rows, errors);
  const smokeLabels = checkSmoke(rows, errors);
  checkRiskFloors(rows, errors);
  const oracle = compareOracle(rows, warnings);
  if (rows.length < 80) errors.push(`only ${rows.length} chunks (< 80)`);
  const sessions = new Set(rows.map((r) => r.session_id)).size;
  if (sessions < 10) errors.push(`only ${sessions} sessions (< 10)`);
  const coverage = coverageOf(rows, pairs);
  for (const k of coverage) if (k.n < k.min) errors.push(`coverage: ${k.name} = ${k.n} < ${k.min}`);
  return { errors, warnings, pairs, coverage, oracle, smokeLabels };
}
