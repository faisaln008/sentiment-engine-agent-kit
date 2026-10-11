# Bench report — `ab-gptoss-r2` (QUICK (gate))

<!-- metrics {"p50":49,"p95":103,"p99":410,"n":50,"errors":0,"scope":"warm a+b, client-side ms","quick":true,"valid_for_latency":false} -->

> **INVALID-FOR-LATENCY:** 48 provider 429 (rate_limited) responses observed in the server log. Do not cite these latency numbers.

- Target: `http://localhost:3027` · `/health` mode `llm:groq` · version `0.1.0`
- Started 2026-10-11T14:45:02.841Z · 490.1 s · run id `261011144502`
- Rate limit: TPM 7000 (--tpm) / tokens per request 1150 (--tokens-per-req) → 6 RPM → **6 RPM used as limit**. Provider free-tier limits are UNVERIFIED (not checked against provider docs in this run). · RPM achieved: 6.0
- Payloads: tune-split texts + acoustics, fresh session/chunk ids, `TelemetryRequestWireSchema`-typed; client timeout 10000 ms

## Gate metrics (warm = scenarios a + b, client-side `performance.now()` around fetch)
|  | n | p50 | p95 | p99 | max |
| --- | --- | --- | --- | --- | --- |
| client ms | 50 | 49 | 103 | 410 | 410 |
| server `processing_latency_ms` | 50 | 43 | 94 | 408 | 408 |

Budget (CLAUDE.md §2.4): p50 < 250 ms, p95 < 500 ms. `scripts/gate.mjs` checks the metrics comment of `reports/bench-quick.md` (written by `--quick`); full runs write `reports/bench-latest.md` (cited by docs).

## Scenarios
| scenario | n | errors | client p50/p95/p99/max | server p50/p95/p99/max | peak in-flight | RPM | note |
| --- | --- | --- | --- | --- | --- | --- | --- |
| a) sequential, 1 session | 30 | 0 | 49 / 103 / 410 / 410 | 43 / 94 / 408 / 408 | 1 | 6 |  |
| b) 5 sessions × 4 concurrent | 20 | 0 | 49 / 73 / 202 / 202 | 44 / 50 / 196 / 196 | 1 | 6 | RPM throttle limits real concurrency (see peak in-flight) |

c) cold boot: skipped (quick mode).

## Responses from our API
- Status/outcome counts: `http_200` 50 · HTTP 429 from our API: 0
- Deadline-timeout **proxy** (warm; server latency within 10 ms of deadline 450 ms, from --deadline-ms): 0/50 (0.0%)

## Provider mix, fallback, heuristic, deadline timeouts, 429s, `finish_reason:length`
### Warm scenarios (target)
- Source: server log, 50/50 chunks matched. `/health` mode: `llm:groq`.
- Provider mix: `heuristic` 50 (100.0%)
- Heuristic answers: 50 (100.0%) · fallback-LLM answers: 0 (0.0%)
- Outcomes: `fallback` 50 (100.0%)
- Deadline timeouts: 0 (0.0%) · provider 429s: 48 (96.0%) · `finish_reason:length`: not logged by backend (`finish_reason` field absent)

## Cache
No verdict cache (cut by the human at freeze, H1 / SPEC §6): cache-on vs cache-off is not applicable; every request is a cache-free model/heuristic call.

## Caveats
Latency depends on the network region and the key's rate limits; the deadline + fallback chain bounds the worst case at about the deadline + a few ms, at the cost of quality on fallback. With an RPM throttle, scenario (b) measures throttled concurrency (see peak in-flight), not truly parallel requests.
