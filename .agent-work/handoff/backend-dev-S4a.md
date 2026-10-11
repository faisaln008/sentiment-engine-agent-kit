# backend-dev S4a — sequential fallback chain, breaker, caps (single review)

## Files
New: `llm/circuit-breaker.ts`, `llm/fallback-chain.ts`, `llm/build-chain.ts`; tests `chain.test.ts` (12), `boot-providers.test.ts` (4).
Changed: `server.ts` (now only wiring via `buildChain`). `LLM_CIRCUIT_FAILURES` / `LLM_CIRCUIT_COOLDOWN_MS` / `LLM_MAX_INFLIGHT` were already in `config.ts` and `.env.example`.

## Behaviour
- `FallbackChain` is a `Classifier` of `Classifier`s, sequential, no timer hedge, no parallel calls. Next provider only after `http`/`bad_json`/`rate_limited`, or when the current one is skipped (disabled, breaker open, in-flight cap; skips report `circuit_open`). The caller's signal is the deadline from t0, so the next provider implicitly gets `deadline - elapsed`. On abort the in-flight call returns `timeout`, the chain returns it at once (no further provider), the caller answers with the heuristic; the timeout counts toward the breaker. Never throws (a throwing provider = `http`).
- Breaker: opens after N consecutive failures for max(cooldown, longest retry-after since last success); after the cooldown one probe is allowed (failure re-opens immediately). Clock injected.
- 401/403: provider disabled for the process lifetime, `onDisabled` logs `{provider,status}` WARN, `chain.mode()` recomputed (`/health` calls it live).
- In-flight cap per provider (`LLM_MAX_INFLIGHT`).
- Only one key, both ways (S3-r1 N13): `buildChain` includes providers that have a key, primary first. Gemini-only key -> Gemini is the effective primary and `/health.mode` = `llm:gemini`; Groq-only -> `llm:groq`; none -> no chain, heuristic. Verified live: server on :3010 with only the Gemini key (Groq key blanked, no Groq calls) -> `/health` `llm:gemini`, 2 chunks answered by `provider:"gemini"` (deflecting 0.82, sarcastic 0.85), warm-up logged `adapter.warm-up ok:true`.
- All providers are warmed up at boot (non-blocking), result logged.

## Tests (names per TASKS S4a)
chain.429-falls-back, chain.error-falls-back, chain.bad-json-next, chain.circuit-open-skips, chain.circuit cooldown >= retry-after, chain.slow-primary-no-hedge, chain.deadline-heuristic, chain.all-open-instant-heuristic, chain.single-provider, chain.auth-error-disables-provider, chain.inflight-cap-skips, chain.never-throws. Time is controlled through the injected breaker clock plus manual AbortControllers instead of vitest fake timers (no timer in the chain to fake).

## ADR-005 §5 measurement (Gemini fallback model, this key, adapter + prompt v1.1, 12 sequential calls each, my machine)
| model | result |
|---|---|
| `gemini-2.5-flash-lite` | **12/12 HTTP 404** (150-350 ms). Listed by `/models` but not callable on this key. Option A not viable here. |
| `gemini-3.1-flash-lite` | 200 x12, p50 1020 ms (warm p50 890, p95 1788), 42-48 completion tokens, finish stop |
| `gemini-3.5-flash-lite` (current default) | 200 x12, p50 681 ms (warm p50 660, p95 852), 42-49 tokens, finish stop |
Nothing is <= ~350 ms, so **Option B**: keep `gemini-3.5-flash-lite`; the fallback covers fast primary errors (429/401/5xx/open circuit) and a Gemini-only evaluator; against a 450 ms deadline it often will not finish (live Gemini-only test needed `LLM_DEADLINE_MS=2000`: 691-740 ms). **Proposal for the human/spec-architect:** if Gemini is used as the effective primary, `LLM_DEADLINE_MS` 450 means near-100% heuristic; consider a per-provider deadline or a higher deadline when the only provider is Gemini (p95 budget 500 conflicts). No default changed.

## Gate
Heuristic server on :3010 (own PID, both keys blanked, no Groq traffic): typecheck, lint, test (140 tests / 18 files), eval:smoke, bench PASS; `latency p50=2 p95=9 errors=0 valid=true`.

## Risks / open
1. Gemini-only deployments exceed the 450 ms deadline almost always (see above): product decision needed.
2. An open breaker resets only by time + a successful probe; no half-open concurrency limit (several requests can probe at once after the cooldown).
3. Skip reasons for cap/disabled are reported as `circuit_open` (port enum has no separate value).
4. 401 during warm-up does not disable the provider (first real call does).
5. Still open from r1: N3, N5, N9, N10, N12.

## Fix loop 1 (review S4a-r1)
- B1: breaker half-open lets exactly one probe through (`probeUntil`; refused until the probe reports or one cooldown passes; success closes, failure re-opens). Tests `breaker.half-open-single-probe` (3 concurrent after cooldown: primary 4th call only, 2 to fallback), `breaker.probe-success-closes`, `breaker.probe-failure-reopens`.
- N1: failure variant has chain-internal `skip?: 'breaker'|'cap'|'disabled'`; the chain keeps the first real provider failure instead of overwriting it with a later skip (`chain.keeps-first-real-failure`). The per-chunk log line gets `skip` when nothing was called.
- N3: breaker-open logs WARN `{provider, retryAfterMs, cooldownMs}`; retry-after capped at 5 min (`breaker.open-warns...`).
- N5: `chain.slow-primary-no-hedge` uses vitest fake timers (advance 10 s). N6: `chain.inflight-released on throw and on abort`.
- Left as instructed: N2, N4 (human decision), N7, N8, N9. No Groq calls; heuristic server on :3010 (own PID).
- Gate: typecheck, lint, test, eval:smoke, bench PASS (see summary).
