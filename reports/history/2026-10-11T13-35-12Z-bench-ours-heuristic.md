# Bench report — `ours-heuristic` (full)

<!-- metrics {"p50":1,"p95":10,"p99":13,"n":400,"errors":0,"scope":"warm a+b, client-side ms","quick":false,"valid_for_latency":true} -->

- Target: `http://localhost:3027` · `/health` mode `heuristic` · version `0.1.0`
- Started 2026-10-11T13:35:11.708Z · 0.9 s · run id `261011133511`
- Rate limit: mode `heuristic` (no LLM): unthrottled; no token budget applied · RPM achieved: n/a (unthrottled)
- Payloads: tune-split texts + acoustics, fresh session/chunk ids, `TelemetryRequestWireSchema`-typed; client timeout 10000 ms

## Gate metrics (warm = scenarios a + b, client-side `performance.now()` around fetch)
|  | n | p50 | p95 | p99 | max |
| --- | --- | --- | --- | --- | --- |
| client ms | 400 | 1 | 10 | 13 | 14 |
| server `processing_latency_ms` | 400 | 0 | 0 | 1 | 2 |

Budget (CLAUDE.md §2.4): p50 < 250 ms, p95 < 500 ms. `scripts/gate.mjs` checks the metrics comment of `reports/bench-quick.md` (written by `--quick`); full runs write `reports/bench-latest.md` (cited by docs).

## Scenarios
| scenario | n | errors | client p50/p95/p99/max | server p50/p95/p99/max | peak in-flight | RPM | note |
| --- | --- | --- | --- | --- | --- | --- | --- |
| a) sequential, 1 session | 200 | 0 | 0 / 1 / 2 / 10 | 0 / 0 / 2 / 2 | 1 | 110426 |  |
| b) 20 sessions × 10 concurrent | 200 | 0 | 3 / 12 / 14 / 14 | 0 / 0 / 0 / 1 | 20 | 259622 |  |
| c) cold boot, first 5 | 5 | 0 | 1 / 5 / 5 / 5 | 0 / 2 / 2 / 2 | 1 | 35260 | fresh process on :3019; /health ready after 327 ms |

## Responses from our API
- Status/outcome counts: `http_200` 405 · HTTP 429 from our API: 0
- Deadline-timeout **proxy** (warm; server latency within 10 ms of deadline 450 ms, from fallback 450 (LLM_DEADLINE_MS not set in env)): 0/400 (0.0%)

## Provider mix, fallback, heuristic, deadline timeouts, 429s, `finish_reason:length`
### Warm scenarios (target)
- Source: server log, 400/400 chunks matched. `/health` mode: `heuristic`.
- Provider mix: `heuristic` 400 (100.0%)
- Heuristic answers: 400 (100.0%) · fallback-LLM answers: n/a (no LLM primary in /health mode)
- Outcomes: `ok` 400 (100.0%)
- Deadline timeouts: not logged by backend (`reason` field absent) · provider 429s: not logged by backend (`reason` field absent) · `finish_reason:length`: not logged by backend (`finish_reason` field absent)

### Cold boot (spawned child stdout)
- Source: server log, 5/5 chunks matched. `/health` mode: `heuristic`.
- Provider mix: `heuristic` 5 (100.0%)
- Heuristic answers: 5 (100.0%) · fallback-LLM answers: n/a (no LLM primary in /health mode)
- Outcomes: `ok` 5 (100.0%)
- Deadline timeouts: not logged by backend (`reason` field absent) · provider 429s: not logged by backend (`reason` field absent) · `finish_reason:length`: not logged by backend (`finish_reason` field absent)

## Cache
No verdict cache (cut by the human at freeze, H1 / SPEC §6): cache-on vs cache-off is not applicable; every request is a cache-free model/heuristic call.

## Caveats
Latency depends on the network region and the key's rate limits; the deadline + fallback chain bounds the worst case at about the deadline + a few ms, at the cost of quality on fallback. With an RPM throttle, scenario (b) measures throttled concurrency (see peak in-flight), not truly parallel requests.
