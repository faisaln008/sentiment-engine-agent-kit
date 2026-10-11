# Spec review r1 — REQUEST_CHANGES

> Written by code-reviewer; saved by the orchestrator because the reviewer is read-only and could not write this file.

**Scope:** specs/SPEC.md, specs/TASKS.md, specs/adr/001–004, packages/contracts/src/{telemetry,ws,index}.ts
**Gate:** not run — packages/contracts has no package.json/tsconfig and zod is not installed. Zod 4 types were checked by reading the code against the zod 4 API; S0 must confirm with a real compile.

Verified: both worked volatility examples (0.86, 0.16) and the 585-min total.

## Blocking

- **B1 — Verdict cache ignores context** (`specs/SPEC.md:145`, `specs/adr/004-concurrency-session-state.md:26`). Key = text + bucketed acoustics + speaker + speaker's prev sentiment; counterpart's last turn is not in the key. Context-flip pairs (same text/acoustics, different context) would get the first cached label, across sessions too.
  Fix: key = sha1(model + prompt version + full dynamic user block). File `.agent-work/requests/skill-latency-engineering.md`. Or cut S7b.
- **B2 — Q4/Q5 defaults change summary values a harness can check** (`SPEC.md:90-91,137,139,207-208`). Reference `aggregated_volatility_score` = fraction of flagged chunks; reference `top_risk_moments` lists high/critical only.
  Fix: fraction of flagged chunks (2dp); filter to high/critical; sort risk desc then most recent first. Mean `v` can go in eval reports.
- **B3 — Lenient field can still 400** (`packages/contracts/src/telemetry.ts:155-158`). Zod 4 `.int()` needs safe integers; `timestamp_ms: 1e20` fails the whole request.
  Fix: preprocess returns `undefined` unless `Number.isSafeInteger(rounded) && rounded >= 0`. Contract test: `1e20` and `"abc"` → 200.
- **B4 — S0 cannot meet its acceptance criteria within lanes** (`TASKS.md:21-27`, `SPEC.md:204`).
  (a) Q1 is settled by CLAUDE.md §7: spec-architect owns `packages/contracts/**` pre-freeze → write `package.json` (`@app/contracts`, ESM, exports map, zod dep) and `tsconfig.json` (`composite: true`) now.
  (b) Root `typecheck` includes `apps/frontend`, which doesn't exist until S6a → S0 gate red. Exclude frontend from typecheck in S0, S6a adds it back (mind Vite `noEmit` vs `composite`).
  (c) S0 eval/bench/simulate stubs would live in `apps/backend/eval/**` (eval-engineer lane). Either eval-engineer creates stubs, or S0 scripts print "not implemented" without creating files.

## Non-blocking

- **N1** `TelemetryRequestInput` (`telemetry.ts:179`): lenient fields infer as required `unknown`. Export a strict `TelemetryRequestWireSchema` for clients; keep lenient schema for server.
- **N2** Contract tests: zod 4 missing-key behaviour (speaker→counterpart, timestamp/acoustics→undefined/{}); join zod 4 issue `path: PropertyKey[]` into a string; prefer `z.strictObject` over deprecated `.strict()` (`telemetry.ts:185-196`).
- **N3** `LenientSpeakerSchema` (`telemetry.ts:161-164`) drops the original value; spec must say the backend reads the raw body for the unknown-speaker warn log.
- **N4** Accept: 404 `session_not_found` body; Q7 additive WS `timestamp_ms`; consider id limit 256 instead of 128.
- **N5** Reference empty body → 200 with no `chunk_id` (not 500 as CLAUDE.md §2 says). S1b to confirm.
- **N6** Summary: `chunk_count`/aggregates must be running counters, not derived from the 200-record capped list. Specify eviction + duplicate-detection behaviour.
- **N7** Commit synchronously in the same tick as `reply.send` (`ADR-004:23`).
- **N8** Hedge at 300 ms vs deadline 450 ms leaves Gemini 150 ms (`ADR-001:29`). Measure at CP1 or hedge ~200 ms; deadline counts from t0.
- **N9** Missing failure-mode rows (`SPEC.md:166-193`): fetch network errors; 401/403 → disable provider, warn once, update `/health.mode`; empty `choices` / `finish_reason:length` (thinking/reasoning tokens vs `max_tokens: 90`); in-flight LLM concurrency cap + overflow behaviour; concurrent sessions/no bleed row; client disconnect; WS without `Origin`; empty-text commit/baseline policy.
- **N10** ADR-003 §4–5: the confidence ≥ 0.8 risk ceiling runs before calibration; state which confidence it uses (calibrated recommended).
- **N11** Model IDs not re-verified by reviewer; Q2 stays with human.

## Time-box

Backend: 265/270 min planned, plus ~95 min gate/review on a sequential chain ⇒ ~360 min (~130%). Eval 67%, frontend 59%.
Proposed cuts: (1) cut S7b cache now (~23 min, removes B1); (2) S4a hedge on error only + breaker, no timer hedge (~10 min); (3) review in pairs S1a+S1b, S3a+S3b, S5a+S5b (~25 min); (4) S10 second cut, ~15 min after B2; (5) move S0 stubs to eval-engineer.

## Checklist
1 Lanes FAIL (B4) · 2 Contract FAIL (B2, B3) · 3 Boundaries PASS · 4 Async PASS w/ notes · 5 Failure modes partial · 6 Latency PASS w/ notes · 7 Tests N/A · 8 Types partial · 9 Security PASS w/ note · 10 Simplicity PASS
