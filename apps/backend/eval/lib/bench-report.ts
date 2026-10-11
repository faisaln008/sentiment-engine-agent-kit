/** Renders reports/bench-*.md. Every value is filled from the run (args, /health, samples, server log). */
import type { Sample, ScenarioResult } from './bench-run.js';
import type { Sourced } from './env-defaults.js';
import { ms, num, pct, table } from './reports.js';
import { providerLines, type ProviderStats } from './server-log.js';
import { summarize, type LatencySummary } from './stats.js';

export interface BenchView {
  label: string;
  quick: boolean;
  target: string;
  mode: string;
  version: string;
  startedAt: string;
  durationS: number;
  runId: string;
  rateAssumption: string;
  rpmAchieved: string;
  timeoutMs: number;
  deadline: Sourced;
  scenarios: ScenarioResult[];
  coldSkipped: string | null;
  warm: Sample[];
  warmProviders: ProviderStats | null;
  cold: { providers: ProviderStats; mode: string } | null;
  /** Non-null when the run must not be cited for latency (e.g. provider 429s observed). */
  invalidReason: string | null;
  metricsJson: string;
}

const ok = (xs: Sample[]): Sample[] => xs.filter((x) => x.error === null);
const serverMs = (xs: Sample[]): number[] =>
  xs.flatMap((x) => (x.serverMs === null ? [] : [x.serverMs]));
const quad = (s: LatencySummary): string =>
  `${ms(s.p50)} / ${ms(s.p95)} / ${ms(s.p99)} / ${ms(s.max)}`;

function scenarioRow(s: ScenarioResult): string[] {
  const good = ok(s.samples);
  return [
    s.name,
    String(s.samples.length),
    String(s.samples.length - good.length),
    quad(summarize(good.map((x) => x.clientMs))),
    quad(summarize(serverMs(good))),
    String(s.peakInFlight),
    num(s.rpm, 0),
    s.note,
  ];
}

function statusLine(samples: Sample[]): string {
  const m = new Map<string, number>();
  for (const s of samples) {
    const k = s.error ?? `http_${s.status}`;
    m.set(k, (m.get(k) ?? 0) + 1);
  }
  return [...m].map(([k, n]) => `\`${k}\` ${n}`).join(', ');
}

export function renderBench(v: BenchView): string {
  const warmOk = ok(v.warm);
  const wc = summarize(warmOk.map((s) => s.clientMs));
  const ws = summarize(serverMs(warmOk));
  const all = v.scenarios.flatMap((s) => s.samples);
  const near = warmOk.filter((s) => (s.serverMs ?? 0) >= v.deadline.value - 10).length;
  const lat = (n: string, s: LatencySummary): string[] => [
    n,
    String(s.n),
    ms(s.p50),
    ms(s.p95),
    ms(s.p99),
    ms(s.max),
  ];
  return `# Bench report — \`${v.label}\` (${v.quick ? 'QUICK (gate)' : 'full'})

<!-- metrics ${v.metricsJson} -->
${v.invalidReason ? `\n> **INVALID-FOR-LATENCY:** ${v.invalidReason}. Do not cite these latency numbers.\n` : ''}
- Target: \`${v.target}\` · \`/health\` mode \`${v.mode}\` · version \`${v.version}\`
- Started ${v.startedAt} · ${v.durationS.toFixed(1)} s · run id \`${v.runId}\`
- Rate limit: ${v.rateAssumption} · RPM achieved: ${v.rpmAchieved}
- Payloads: tune-split texts + acoustics, fresh session/chunk ids, \`TelemetryRequestWireSchema\`-typed; client timeout ${v.timeoutMs} ms

## Gate metrics (warm = scenarios a + b, client-side \`performance.now()\` around fetch)
${table(['', 'n', 'p50', 'p95', 'p99', 'max'], [lat('client ms', wc), lat('server `processing_latency_ms`', ws)])}

Budget (CLAUDE.md §2.4): p50 < 250 ms, p95 < 500 ms. \`scripts/gate.mjs\` checks the metrics comment of \`reports/bench-quick.md\` (written by \`--quick\`); full runs write \`reports/bench-latest.md\` (cited by docs).

## Scenarios
${table(['scenario', 'n', 'errors', 'client p50/p95/p99/max', 'server p50/p95/p99/max', 'peak in-flight', 'RPM', 'note'], v.scenarios.map(scenarioRow))}
${v.coldSkipped ? `\nc) cold boot: skipped (${v.coldSkipped}).\n` : ''}
## Responses from our API
- Status/outcome counts: ${statusLine(all)} · HTTP 429 from our API: ${all.filter((s) => s.status === 429).length}
- Deadline-timeout **proxy** (warm; server latency within 10 ms of deadline ${v.deadline.value} ms, from ${v.deadline.source}): ${near}/${warmOk.length} (${pct(warmOk.length ? near / warmOk.length : Number.NaN)})

## Provider mix, fallback, heuristic, deadline timeouts, 429s, \`finish_reason:length\`
### Warm scenarios (target)
${providerLines(v.warmProviders, v.mode).join('\n')}
${v.cold ? `\n### Cold boot (spawned child stdout)\n${providerLines(v.cold.providers, v.cold.mode).join('\n')}\n` : ''}
## Cache
No verdict cache (cut by the human at freeze, H1 / SPEC §6): cache-on vs cache-off is not applicable; every request is a cache-free model/heuristic call.

## Caveats
Latency depends on the network region and the key's rate limits; the deadline + fallback chain bounds the worst case at about the deadline + a few ms, at the cost of quality on fallback. With an RPM throttle, scenario (b) measures throttled concurrency (see peak in-flight), not truly parallel requests.
`;
}
