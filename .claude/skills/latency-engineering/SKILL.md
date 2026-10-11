---
name: latency-engineering
description: Latency budget, measurement method and optimisation checklist for the < 250 ms p50 / < 500 ms p95 target. Use when designing the request pipeline, adding anything to the hot path, writing bench.ts, or reviewing performance.
---

# Latency engineering

## Budget (p50, end-to-end at the client)
| Stage | Budget |
|---|---|
| HTTP parse + zod validate | 1 ms |
| session snapshot + acoustic features | 1 ms |
| cache lookup | < 1 ms |
| prompt build | < 1 ms |
| **LLM round trip** | **≤ 200 ms** |
| parse + fuse + truncate + serialize | 2 ms |
| network/loopback slack | ~40 ms |

Anything else on the hot path needs a reviewer-approved reason.

## Rules
- Everything not needed for the response happens **after** `reply.send()`: session commit, WS broadcast, metrics.
- No sync CPU > 1 ms (no big regex loops over history, no JSON.stringify of sessions).
- Input tokens cost latency: report prompt token count per prompt version; cap context at 3 turns × 40 words.
- Output tokens cost more: compact JSON keys, `max_tokens` ~90.
- Keep-alive + boot warm-up; cold first request is a measurement bug, not "real".
- Cache key = sha1(normalised text + bucketed acoustics (0.1 steps) + prev sentiment of speaker). LRU, size-capped. Report cache-on and cache-off numbers separately — never present cached numbers as model latency.
- Hedge, don't retry. Deadline, don't wait.

## Measurement (`bench.ts`)
- Use `performance.now()` around `fetch` on the client side; also collect server-reported `processing_latency_ms`.
- Scenarios: (a) 200 sequential chunks, 1 session; (b) 20 concurrent sessions × 10 chunks; (c) cold boot first 5 chunks.
- Report p50/p95/p99/max, provider mix, fallback rate, heuristic rate, 429 count, cache hit rate.
- Write `<!-- metrics {"p50":..,"p95":..} -->` into `reports/bench-latest.md` (read by `scripts/gate.mjs`).
- Free-tier limits: throttle bench to stay under provider RPM or results measure the rate limiter, not the system. Note RPM used in the report.

## Honest framing for docs
Latency depends on the evaluator's network region and their key's rate limits; the deadline + fallback chain bounds the worst case (≈ DEADLINE_MS + few ms) at the cost of quality on fallback.
