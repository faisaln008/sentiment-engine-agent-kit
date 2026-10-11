# backend-dev S1a handoff

## Changed (apps/backend/src, test; root vitest.config.ts, package.json dev script)
- config.ts: empty strings = unset; bounds (posInt, PORT 1-65535, VOLATILITY_THRESHOLD 0-1, LOG_LEVEL enum); readable error listing `KEY: message`.
- domain/truncate.ts (pure), llm/classifier.ts (port + LlmVerdict), heuristics/placeholder.ts (neutral, S1b swaps it), services/analyze-chunk.ts, http/routes.ts (POST stream + /health), infra/version.ts, app.ts (error handler: 413 / 400 invalid_request, WARN once when no keys, LogController disableRequestLogging, `AppDeps {classifier?, logStream?}`).
- N4: root `dev` builds contracts first. CORRECTION (fix loop 1): the original claim that a vitest alias for `@app/contracts` was added was FALSE; vitest.config.ts was unchanged. Alias now really added and verified with packages/contracts/dist deleted.
- N7: one info line per chunk `{chunk_id, session_id, provider, latency_ms, outcome}`, no text.
- Tests: truncate.test.ts (6), contract.test.ts (12: all named contract.* cases + health, blank text, truncation, throwing classifier), config.test.ts (4).

## Verified
npm run gate: PASS typecheck, PASS lint, PASS test (4 files, 23 tests), eval/bench SKIPPED (backend not up; S2).

## Notes / risks
- `disableRequestLogging` option is deprecated in Fastify 5.12 (FSTDEP023); used `LogController` instead, which needs fastify >= 5.12 (lockfile has 5.12.5; package.json range still ^5.0.0, not changed).
- Unknown-speaker warn-once-per-session uses a closure-local Set capped at 1000 (cleared when full).
- volatility_flag is hard-coded false and mode is always "heuristic" until S4/S5 (comments mark it).
- CORRECTION (fix loop 1): originally a 415 passed through unmapped (the claim of a 400 mapping was false). Now mapped to 400 `invalid_request` with message 'body must be JSON (Content-Type: application/json)', with a test.
- Truncation test was corrected to really truncate (renamed `contract.truncates-61-121`, exact-string asserts).
- deadline passed as AbortSignal.timeout(remaining from t0); placeholder ignores it.
