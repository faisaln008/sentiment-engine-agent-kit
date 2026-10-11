# Requests from eval-engineer (S2b/S2c)

## R1 → orchestrator / root-config owner: `vitest.config.ts` fails `prettier --check` (gate lint RED)
Commit e2e4579 (S6a, "vitest include extended … (orchestrator, root config)") left the `include` array on one 120+ char line.
`npm run gate` fails at lint for every agent until it's fixed. Fix: `npx prettier --write vitest.config.ts` (no semantic change).

## R2 → backend-dev (root config): run eval-lib unit tests in `npm test`
Add `'apps/backend/eval/test/**/*.test.ts'` to `test.include` in `vitest.config.ts`.
`apps/backend/eval/test/stats.test.ts` (8 tests: percentile, P/R/F1 zero cases, macro-F1, constant floor, risk MAE, binary, Wilson, pool)
currently passes only via a scratch config. Typecheck already covers it (tsconfig.check.json includes `eval/**`).

## R3 → backend-dev (`scripts/gate.mjs`, root): configurable target + stricter readiness probe
1. `GATE_TARGET` env (default `http://localhost:3000`) used for the probe, and passed through as
   `eval:smoke -- --target $GATE_TARGET` and `bench -- --quick --target $GATE_TARGET`.
   Reason: on this machine :3000 is held by an unrelated `next-server` (another project), so our backend ran on :3010
   and the gate's eval/bench branch could only be verified with a scratch copy of gate.mjs.
2. `backendUp()` should check the body, not just `res.ok`: `status === "ok"` and `mode` matches `OUR_HEALTH_MODE_RE`.
   Otherwise any foreign app that answers 200 on `/health` makes the gate run eval/bench against it.

## R4 → backend-dev (S3a/S4a, logging): make provider outcomes observable for bench/eval
The response has no provider field, so bench/eval read the per-chunk info log line (`msg:"chunk"`) when given
`--server-log <file>`. Already logged: `provider`, `outcome`. Please add (no text, no keys):
- `reason`: `timeout|rate_limited|http|bad_json|circuit_open|no_key` for the attempt that fell through (or the last one), so the
  bench can report deadline-timeout % and provider-429 count;
- `finish_reason` from the provider response (e.g. `length`), so `finish_reason:length` can be counted.
The reports print "not logged by backend" until these fields appear. They never guess.
