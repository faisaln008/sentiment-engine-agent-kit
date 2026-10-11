# Bench report — `ours-heuristic` (full)

<!-- metrics {"p50":1,"p95":10,"p99":16,"n":400,"errors":0,"scope":"warm a+b, client-side ms","quick":false} -->

- Target: `http://localhost:3010` · `/health` mode `heuristic` · version `0.1.0`
- Started 2026-10-11T13:18:17.264Z · 0.9 s · run id `261011131817`
- RPM limit: none (unthrottled) · RPM used overall: 31088
- Payloads: tune-split texts + acoustics, fresh session/chunk ids, `TelemetryRequestWireSchema`-typed; client timeout 10000 ms

## Gate metrics (warm = scenarios a + b, client-side `performance.now()` around fetch)
|  | n | p50 | p95 | p99 | max |
| --- | --- | --- | --- | --- | --- |
| client ms | 400 | 1 | 10 | 16 | 16 |
| server `processing_latency_ms` | 400 | 0 | 0 | 0 | 0 |

Budget (CLAUDE.md §2.4): p50 < 250 ms, p95 < 500 ms. Checked by `scripts/gate.mjs` from the metrics comment.

## Scenarios
| scenario | n | errors | client p50/p95/p99/max | server p50/p95/p99/max | peak in-flight | RPM | note |
| --- | --- | --- | --- | --- | --- | --- | --- |
| a) sequential, 1 session | 200 | 0 | 0 / 1 / 1 / 4 | 0 / 0 / 0 / 0 | 1 | 134684 |  |
| b) 20 sessions × 10 concurrent | 200 | 0 | 3 / 13 / 16 / 16 | 0 / 0 / 0 / 0 | 20 | 231868 |  |
| c) cold boot, first 5 | 5 | 0 | 1 / 6 / 6 / 6 | 0 / 3 / 3 / 3 | 1 | 30883 | fresh process on :3019; /health ready after 320 ms |

## Responses from our API
- Status/outcome counts: `http_200` 405 · HTTP 429 from our API: 0
- Server latency within 10 ms of the deadline (`--deadline-ms` 450, = `LLM_DEADLINE_MS` default) (deadline-timeout **proxy**, warm): 0/400 (0.0%)

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
Latency depends on the network region and the key's rate limits; the deadline + fallback chain bounds the worst case at ≈ `LLM_DEADLINE_MS` + a few ms, at the cost of quality on fallback. With an RPM throttle, scenario (b) measures throttled concurrency (see peak in-flight), not 20 truly parallel requests.
