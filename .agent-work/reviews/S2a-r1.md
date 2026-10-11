# S2a review r1 — REQUEST_CHANGES

> Written by code-reviewer (read-only); saved by the orchestrator. Reviewer note: it briefly ran an empty `mkdir`/`rmdir` under `apps/backend/eval/` (outside its read-only allowance; no residue, git status unchanged).

Gate re-run by reviewer: typecheck/lint/test PASS (6 files, 41 tests), eval/bench SKIPPED; validator exit 0 OK; `npx eslint apps/backend/eval` exit 0.

## Blocking
- **B1** `apps/backend/eval/SCHEMA.md:31-32`, `validate-dataset.ts:78-81` (`checkFusion`) — `expected_volatility` is forced to equal the ADR-003 formula replayed over expected labels; the validator fails on disagreement. Labels are therefore computed by the system under test. Evidence: s08_c07 judged `false`, flipped to `true` only because the formula gives v=0.68 (ai-log) — violates eval-methodology "never edit labels to fit outputs". Volatility F1 can then never reveal formula misses, and S8 weight tuning would be circular (CLAUDE.md §2.9).
  Fix **(A, preferred)**: `expected_volatility` = human judgement; decide s08_c07 on its merits; downgrade the oracle to WARN with a "formula vs label disagreements" table; S2b reports detection F1 and fusion fidelity separately. **(B)**: keep formula-derived labels but document them as fidelity-only, never for tuning.

## Non-blocking
- **N1** Handoff/ai-log claim "every v ≥ 0.07 from 0.6" is false (s11_c07 v=0.540; s06_c07 0.560 with population std). Flags unchanged. Fix the claim or enforce a 0.07 WARN band.
- **N2** If the baseline included the current chunk, 5 of 9 `true` labels flip. Ticket S5b unit test (baseline excludes current chunk) and S5a sample vs population std.
- **N3** cf-number (s14_c04/s15_c04) not a clean counterfactual (previous turn differs; overlapping acceptable sets). Add one clean pair or narrow sets.
- **N4** s06_c08 — taxonomy tie-break makes `deflecting` primary over negative; relabel or justify.
- **N5** s09_c04 — sarcastic reading weak in context; consider placing after a candidate push.
- **N6** s07_c08 — thanks for a payment-terms move that never happens in s07; add an earlier turn.
- **N7** T3 partial: add sincere "Sure, that works for us." (positive) and a non-deferral "stakeholders" sentence.
- **N8** Risk inconsistency: third-party deflection on must-have is high in s06_c02/s13_c03 but medium in s10_c06.
- **N9** Constant-`neutral` floor: 29.1% strict / 45.3% lenient overall, 40% lenient on smoke. S2b must print the floor; consider dropping `neutral` from s04_c02.
- **N10** Smoke (s01+s02) thin: no injection, no full context-flip pair, n=1 for several classes. Threshold on lenient accuracy well above 40% floor; never cite smoke numbers in docs.
- **N11** Commit the dataset alone before any S2b run, so git proves labels-before-run.
- **N12** `apps/backend/eval/**/*.ts` (and `test/`) not covered by gate typecheck. Ticket backend-dev: `tsconfig.eval.json` chained into root `typecheck`.
- **N13** `eval:validate` placement: human grants eval-engineer the `scripts.eval*|bench|simulate` entries, or backend-dev adds them. `run-eval.ts` should validate the dataset at start-up.
- **N14** Validator hygiene: side effects in print helpers; check acceptable sets ≤ 3; check counterfactual members share preceding turns.

## Checklist
1 Lanes PASS · 2 Contract PASS (117 rows valid, unique ids, monotonic timestamps, session split 12/89 vs 3/28) · 3 Boundaries N/A · 4 Async N/A · 5 Failure modes PARTIAL (4 injections OK) · 6 Latency N/A · 7 Tests FAIL (B1) · 8 Types PASS with gap (N12) · 9 Security PASS (5-gram/4-gram leakage scan vs brief: only contract field names) · 10 Simplicity PASS

## Acceptance criteria
Counts MET (117/15); coverage MET by count (caveats B1, N3); brief pattern MET (4 labels); split + smoke MET (N10). Labels-before-run asserted only (N11). Oracle matches ADR-003 exactly; sample vs population std open (N2).
