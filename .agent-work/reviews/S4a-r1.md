# S4a review r1 (single) — REQUEST_CHANGES

> Written by code-reviewer (read-only; no servers, no provider calls); saved by the orchestrator.

Reviewer checks: chain + boot-providers tests 16/16; typecheck clean; eslint clean on changed files. Orchestrator: typecheck 0, lint 0, vitest 140/140; agent heuristic gate on :3010 smoke PASS, bench p50 2 / p95 9, errors 0 (heuristic path only).

## Blocking
- **B1** `apps/backend/src/llm/circuit-breaker.ts:3-4,19-21` — half-open has no probe limit despite the doc comment: `allow()` is `now >= openUntil`, so every request after cooldown passes until the first result (up to LLM_MAX_INFLIGHT=16). At 8000 TPM (~10 RPM) each cooldown expiry against a 429ing Groq bursts ~12k tokens, keeping the org rate-limited and the breaker flapping. Fix: `probeUntil`; when tripped and past `openUntil`, allow only if `now >= probeUntil` then set `probeUntil = now + cooldownMs`; `onSuccess` resets. Tests `breaker.half-open-single-probe` (3 concurrent after cooldown → primary.calls === 1, 2 to fallback) and `breaker.probe-success-closes`.

## Non-blocking
- **N1** `fallback-chain.ts:55-57` — breaker/cap/disabled skips all report `circuit_open`; a later skip overwrites an earlier real failure (503 lost). Add internal `skip?: 'breaker'|'cap'|'disabled'`; keep first real failure in `last`.
- **N2** `server.ts:28` / `openai-adapter.ts:100-125` — warm-up 401/403 doesn't disable provider; optional `chain.warmUp()`.
- **N3** `openai-adapter.ts:30-33` + `circuit-breaker.ts:31-33` — retry-after uncapped and sticky; cap (e.g. 5 min) or warn-log `{provider, retryAfterMs}` on open.
- **N4** Product decision (human): with 450 ms deadline, Gemini (p50 681 ms) nearly always times out as fallback or sole provider; Gemini-only evaluator ⇒ mostly heuristic while /health says `llm:gemini`; fallback also started with only a few ms left. Options: document "Gemini-only ⇒ raise LLM_DEADLINE_MS (accepting p95 > 500)", or a minimum-remaining-budget rule (ADR-005 follow-up). No default change in this slice.
- **N5** `chain.test.ts:120-130` — `slow-primary-no-hedge` uses 60 ms real wait; use fake timers + advance 10 s.
- **N6** no test that in-flight counter is released on throw/abort; add `chain.inflight-released-on-throw-and-abort`.
- **N7** `chain.test.ts:150-158` — all-open test: two providers in mixed states, assert call counts, drop tight wall-clock bound.
- **N8** `fallback-chain.ts:59` — comment the port requirement: implementations must settle on abort.
- **N9** `fallback-chain.ts:72` — unreachable `no_key` branch; remove or comment.
- **N10** carried S3-r2 N1, N4–N8.

## Focus answers
In-flight always released (finally) YES; state per provider, confined to chain instance YES; half-open stampede → B1; skip reasons misleading → N1; warm-up 401 → N2; /health mode race-free YES; no unhandled rejections; timeouts count toward breaker YES (per SPEC §7; cost in N4); remaining budget correct; never throws YES; tests mostly deterministic (N5, N7).

## Acceptance criteria
Gemini measurement PASS (Option B); chain semantics PASS; deadline → heuristic PASS; breaker PARTIAL (B1); in-flight cap PASS; ten named tests PASS (strength nits N5–N7).

## Checklist
1 Lanes PASS · 2 Contract PASS · 3 Boundaries PASS · 4 Async PASS w/ B1 · 5 Failure modes PASS · 6 Latency PASS · 7 Tests PASS · 8 Types PASS · 9 Security PASS · 10 Simplicity PASS
