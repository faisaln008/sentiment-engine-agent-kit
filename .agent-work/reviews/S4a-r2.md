# S4a review r2 (single, final loop) — APPROVE

> Written by code-reviewer (read-only; no servers, no provider calls); saved by the orchestrator.

Reviewer checks: vitest 18 files / 146 tests; typecheck 0; lint 0. Agent heuristic gate: smoke PASS, bench p50 1 / p95 4, errors 0 (heuristic path only — no LLM-chain bench numbers yet).

## r1 B1 — RESOLVED
`circuit-breaker.ts:25-32`: closed → allow; open → refuse; after cooldown first `allow()` claims the probe (`probeUntil = t + cooldownMs`), others refused; success closes; failure re-opens for max(cooldown, retry-after); a never-settling probe is released after exactly one cooldown; aborted fallback probes still call `onFailure`. `fallback-chain.ts:72-76` order disabled → cap → allow, no await between allow and call. Tests half-open-single-probe, probe-success-closes, probe-failure-reopens assert call counts.

## r1 non-blocking addressed
N1 internal `skip` + first real failure kept (`chain.keeps-first-real-failure`, logged at routes.ts:69); N3 retry-after capped 5 min + WARN `{provider, retryAfterMs, cooldownMs}`; N5 fake timers; N6 `chain.inflight-released`.

## Non-blocking
- **N1** `chain.test.ts:292-299` throw half of inflight-released can't detect a leak — count calls on `boom`, assert 3.
- **N2** no test for stuck-probe expiry (`breaker.stuck-probe-expires`).
- **N3** `circuit-breaker.ts:46-50` stale failure during an outstanding probe resets probeUntil (≤ 2 concurrent probes); WARN may repeat — warn only on closed→open.
- **N4** `fallback-chain.ts:58` aborted-at-top result may carry `skip` with reason timeout; strip for clean counts.
- **N5** Human decision: Gemini-only under 450 ms deadline ⇒ mostly heuristic while /health says `llm:gemini`. Carried: warm-up 401, abort-settle comment, unreachable no_key, S3-r2 carry-overs.

## Acceptance criteria — all PASS
## Checklist — 1–10 PASS
