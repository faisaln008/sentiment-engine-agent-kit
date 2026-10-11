# Bench report — `ab-gptoss` (QUICK (gate))

<!-- metrics {"p50":400,"p95":461,"p99":469,"n":50,"errors":0,"scope":"warm a+b, client-side ms","quick":true,"valid_for_latency":false} -->

> **INVALID-FOR-LATENCY:** 5 provider 429 (rate_limited) responses observed in the server log. Do not cite these latency numbers.

- Target: `http://localhost:3027` · `/health` mode `llm:groq` · version `0.1.0`
- Started 2026-10-11T14:38:10.684Z · 367.6 s · run id `261011143810`
- Rate limit: TPM 7000 (--tpm) / tokens per request 850 (--tokens-per-req) → 8 RPM → **8 RPM used as limit**. Provider free-tier limits are UNVERIFIED (not checked against provider docs in this run). · RPM achieved: 8.0
- Payloads: tune-split texts + acoustics, fresh session/chunk ids, `TelemetryRequestWireSchema`-typed; client timeout 10000 ms

## Gate metrics (warm = scenarios a + b, client-side `performance.now()` around fetch)
|  | n | p50 | p95 | p99 | max |
| --- | --- | --- | --- | --- | --- |
| client ms | 50 | 400 | 461 | 469 | 469 |
| server `processing_latency_ms` | 50 | 392 | 453 | 454 | 454 |

Budget (CLAUDE.md §2.4): p50 < 250 ms, p95 < 500 ms. `scripts/gate.mjs` checks the metrics comment of `reports/bench-quick.md` (written by `--quick`); full runs write `reports/bench-latest.md` (cited by docs).

## Scenarios
| scenario | n | errors | client p50/p95/p99/max | server p50/p95/p99/max | peak in-flight | RPM | note |
| --- | --- | --- | --- | --- | --- | --- | --- |
| a) sequential, 1 session | 30 | 0 | 419 / 468 / 469 / 469 | 411 / 453 / 453 / 453 | 1 | 8 |  |
| b) 5 sessions × 4 concurrent | 20 | 0 | 317 / 459 / 460 / 460 | 314 / 453 / 454 / 454 | 1 | 8 | RPM throttle limits real concurrency (see peak in-flight) |

c) cold boot: skipped (quick mode).

## Responses from our API
- Status/outcome counts: `http_200` 50 · HTTP 429 from our API: 0
- Deadline-timeout **proxy** (warm; server latency within 10 ms of deadline 450 ms, from --deadline-ms): 17/50 (34.0%)

## Provider mix, fallback, heuristic, deadline timeouts, 429s, `finish_reason:length`
### Warm scenarios (target)
- Source: server log, 50/50 chunks matched. `/health` mode: `llm:groq`.
- Provider mix: `heuristic` 39 (78.0%), `groq` 11 (22.0%)
- Heuristic answers: 39 (78.0%) · fallback-LLM answers: 0 (0.0%)
- Outcomes: `fallback` 39 (78.0%), `ok` 11 (22.0%)
- Deadline timeouts: 16 (32.0%) · provider 429s: 5 (10.0%) · `finish_reason:length`: 1 (2.0%)

## Cache
No verdict cache (cut by the human at freeze, H1 / SPEC §6): cache-on vs cache-off is not applicable; every request is a cache-free model/heuristic call.

## Caveats
Latency depends on the network region and the key's rate limits; the deadline + fallback chain bounds the worst case at about the deadline + a few ms, at the cost of quality on fallback. With an RPM throttle, scenario (b) measures throttled concurrency (see peak in-flight), not truly parallel requests.
