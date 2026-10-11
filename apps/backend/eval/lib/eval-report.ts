/** Renders reports/eval-*.md. Every label/number is filled from data (args, /health, dataset, results). */
import { RISK_ORDER, SENTIMENTS, SPEAKERS } from '@app/contracts';
import type { LabelledChunk } from './dataset.js';
import type { EvalMetrics } from './eval-metrics.js';
import type { ChunkResult } from './eval-run.js';
import { ms, num, pct, table } from './reports.js';
import { wilson } from './stats.js';
import { VOLATILITY_THRESHOLD, VOLATILITY_THRESHOLD_SOURCE } from './volatility-oracle.js';

export interface EvalMeta {
  label: string;
  target: string;
  scope: string;
  healthMode: string;
  healthVersion: string;
  startedAt: string;
  durationS: number;
  runId: string;
  rateAssumption: string;
  rpmAchieved: string;
  concurrency: number;
  providerLines: string[];
  smoke: { threshold: number; pass: boolean } | null;
}
export type Baseline = { label: string; metrics: EvalMetrics } | { label: string; missing: string };

const delta = (a: number, b: number, d = 1, scale = 100): string =>
  Number.isFinite(a) && Number.isFinite(b)
    ? `${a - b >= 0 ? '+' : ''}${((a - b) * scale).toFixed(d)}`
    : 'n/a';

function headline(m: EvalMetrics, meta: EvalMeta, base: Baseline | null): string {
  const b = base && 'metrics' in base ? base.metrics : null;
  const rows: [string, (x: EvalMetrics) => number, 'pct' | 'num' | 'ms', number | null][] = [
    ['Strict accuracy', (x) => x.cls.strict, 'pct', m.neutralFloor.strict],
    ['Lenient accuracy', (x) => x.cls.lenient, 'pct', m.neutralFloor.lenient],
    ['**Macro-F1** (headline)', (x) => x.cls.macroF1, 'num', m.neutralFloor.macroF1],
    ['Nuance subset strict', (x) => x.nuance.strict, 'pct', null],
    ['Nuance subset lenient', (x) => x.nuance.lenient, 'pct', null],
    ['Volatility detection F1 (vs human labels)', (x) => x.detection.f1, 'num', null],
    ['Volatility fusion fidelity (agreement vs oracle)', (x) => x.fidelity.agreement, 'pct', null],
    ['Risk MAE (ordinal, lower is better)', (x) => x.risk.mae, 'num', null],
    ['Risk exact match', (x) => x.risk.exact, 'pct', null],
    ['Client p50 ms (during eval, not a bench)', (x) => x.client.p50, 'ms', null],
    ['Client p95 ms', (x) => x.client.p95, 'ms', null],
  ];
  const f = (k: 'pct' | 'num' | 'ms', x: number): string =>
    k === 'pct' ? pct(x) : k === 'ms' ? ms(x) : num(x);
  const d = (k: 'pct' | 'num' | 'ms', a: number, c: number): string =>
    k === 'pct'
      ? `${delta(a, c)} pp`
      : k === 'ms'
        ? delta(Math.round(a), Math.round(c), 0, 1)
        : delta(a, c, 2, 1);
  const head = [
    'Metric',
    `${meta.label}`,
    ...(b && base ? [base.label, 'Δ'] : []),
    'constant-`neutral` floor',
  ];
  return table(
    head,
    rows.map(([name, get, k, floor]) => [
      name,
      f(k, get(m)),
      ...(b ? [f(k, get(b)), d(k, get(m), get(b))] : []),
      floor === null ? '' : f(k, floor),
    ]),
  );
}

function perClass(m: EvalMetrics, base: Baseline | null): string {
  const b = base && 'metrics' in base ? base.metrics : null;
  return table(
    ['Class', 'support', 'predicted', 'P', 'R', 'F1', ...(b && base ? [`${base.label} F1`] : [])],
    m.cls.perClass.map((c) => [
      c.label,
      String(c.support),
      String(c.predicted),
      num(c.precision),
      num(c.recall),
      num(c.f1),
      ...(b ? [num(b.cls.perClass.find((x) => x.label === c.label)?.f1 ?? Number.NaN)] : []),
    ]),
  );
}

function confusion(m: EvalMetrics): string {
  const errCol = SENTIMENTS.some((s) => m.cls.confusion[s].error > 0);
  const cols = [...SENTIMENTS, ...(errCol ? (['error'] as const) : [])];
  return table(
    ['expected \\ got', ...cols],
    SENTIMENTS.map((s) => [s, ...cols.map((c) => String(m.cls.confusion[s][c] || '·'))]),
  );
}

function coverage(rows: readonly LabelledChunk[]): string {
  return table(
    ['expected', ...SPEAKERS, 'total'],
    SENTIMENTS.map((s) => {
      const n = (sp?: string): number =>
        rows.filter((r) => r.expected_sentiment === s && (!sp || r.speaker === sp)).length;
      return [s, ...SPEAKERS.map((sp) => String(n(sp))), String(n())];
    }),
  );
}

function failures(rows: readonly LabelledChunk[], results: readonly ChunkResult[]): string {
  const byId = new Map(results.map((x) => [x.chunk_id, x]));
  const out: string[][] = [];
  for (const r of rows) {
    const x = byId.get(r.chunk_id);
    const g = x?.response ?? null;
    if (g && g.sentiment === r.expected_sentiment) continue;
    const lenient = g !== null && r.acceptable_sentiments.includes(g.sentiment);
    const riskD = g ? RISK_ORDER[g.risk_level] - RISK_ORDER[r.expected_risk] : Number.NaN;
    out.push([
      r.chunk_id,
      r.speaker === 'candidate' ? 'cand' : 'cp',
      `${r.expected_sentiment} [${r.acceptable_sentiments.join('/')}]`,
      g ? `${g.sentiment}${lenient ? ' (lenient ok)' : ''}` : `ERROR ${x?.error ?? 'missing'}`,
      g ? num(g.confidence) : '',
      g
        ? `${r.expected_risk}→${g.risk_level}${riskD ? ` (${riskD > 0 ? '+' : ''}${riskD})` : ''}`
        : '',
      g ? `${r.expected_volatility ? 'T' : 'F'}→${g.volatility_flag ? 'T' : 'F'}` : '',
      r.tags.filter((t) => t !== 'smoke').join(', '),
      r.text.length > 70 ? `${r.text.slice(0, 67)}...` : r.text,
    ]);
  }
  return out.length
    ? table(
        [
          'chunk',
          'spk',
          'expected [acceptable]',
          'got',
          'conf',
          'risk exp→got',
          'vol',
          'tags',
          'text',
        ],
        out,
      )
    : '_No strict failures._';
}

export function renderEval(
  meta: EvalMeta,
  rows: readonly LabelledChunk[],
  results: readonly ChunkResult[],
  m: EvalMetrics,
  base: Baseline | null,
): string {
  const v = (x: EvalMetrics['detection']): string =>
    `P ${num(x.precision)} · R ${num(x.recall)} · F1 ${num(x.f1)} (TP ${x.tp}, FP ${x.fp}, FN ${x.fn}; truth-positives ${x.positives}/${x.n}; agreement ${pct(x.agreement)})`;
  const sessions = new Set(rows.map((r) => r.session_id)).size;
  const ci = (name: string, p: number, n: number): string => {
    const [lo, hi] = wilson(Math.round(p * n), n);
    return `${name} ${pct(p)} [${pct(lo)}, ${pct(hi)}] (n ${n})`;
  };
  return `# Eval report — \`${meta.label}\` (${meta.scope})

- Target: \`${meta.target}\` · \`/health\` mode \`${meta.healthMode}\` · version \`${meta.healthVersion}\`
- Started ${meta.startedAt} · ${meta.durationS.toFixed(1)} s · run id \`${meta.runId}\`
- Dataset: ${rows.length} chunks, ${sessions} sessions · ${m.errors} request/schema errors
- Replay: sessions in parallel (≤ ${meta.concurrency}), chunks sequential in timestamp order; rate limit: ${meta.rateAssumption} · RPM achieved: ${meta.rpmAchieved}
${meta.smoke ? `- **Smoke gate:** lenient accuracy ${pct(m.cls.lenient)} vs threshold ${pct(meta.smoke.threshold)} → **${meta.smoke.pass ? 'PASS' : 'FAIL'}** (constant-\`neutral\` lenient floor ${pct(m.neutralFloor.lenient)}). Smoke numbers are a regression tripwire, never a quality claim.\n` : ''}${base && 'missing' in base ? `- Baseline \`${base.label}\`: unavailable (${base.missing}).\n` : ''}
## Headline
${headline(m, meta, base)}

Lenient = prediction ∈ \`acceptable_sentiments\`. Macro-F1 averages ${m.cls.macroClasses} classes (support or predictions > 0); undefined P/R count as 0.
Mean confidence: correct ${num(m.confCorrect)} · wrong ${num(m.confWrong)}.

## Coverage (this run)
${coverage(rows)}

## Per-class
${perClass(m, base)}

## Confusion matrix (rows = expected, cols = got)
${confusion(m)}

## Nuance and slices
${table(
  ['Slice', 'n', 'strict', 'lenient'],
  [m.nuance, ...m.groups]
    .filter((g) => g.n > 0)
    .map((g) => [g.name, String(g.n), pct(g.strict), pct(g.lenient)]),
)}

Pairs (same text): ${m.pairs.length ? '' : 'none in this run'}
${
  m.pairs.length
    ? table(
        ['pair', 'kind', 'members (expected→got)', 'both strict-correct'],
        m.pairs.map((p) => [
          p.id,
          p.kind,
          p.members.map((x) => `${x.chunk_id} ${x.expected}→${x.got ?? 'ERR'}`).join('; '),
          p.members.every((x) => x.ok) ? 'yes' : 'no',
        ]),
      )
    : ''
}

## Volatility
- **Detection** (API \`volatility_flag\` vs human \`expected_volatility\`): ${v(m.detection)}
- **Fusion fidelity** (API flag vs ADR-003 oracle replayed over the *returned* sentiments + dataset acoustics, threshold ${VOLATILITY_THRESHOLD} from ${VOLATILITY_THRESHOLD_SOURCE}; if the chunk before an errored request has no returned label, its expected label stands in): ${v(m.fidelity)}
- Detection mixes sentiment errors, formula limits and labeller noise; fidelity isolates the deterministic code.

## Risk
MAE ${num(m.risk.mae)} · exact ${pct(m.risk.exact)} · signed bias ${num(m.risk.bias)} (> 0 = over-alerting) · n ${m.risk.n}

## Provider mix
${meta.providerLines.join('\n')}

## Latency observed during eval (not a benchmark — see bench report)
client p50 ${ms(m.client.p50)} / p95 ${ms(m.client.p95)} / max ${ms(m.client.max)} ms · server \`processing_latency_ms\` p50 ${ms(m.server.p50)} / p95 ${ms(m.server.p95)} ms

## Failures (strict misses; lenient-ok marked)
${failures(rows, results)}

## Limits
Single labeller, self-authored data (shares the author's blind spots). Per-class n is small (see Coverage).
95% Wilson intervals: ${ci('strict', m.cls.strict, m.n)} · ${ci('lenient', m.cls.lenient, m.n)} · ${ci('nuance strict', m.nuance.strict, m.nuance.n)}.
`;
}
