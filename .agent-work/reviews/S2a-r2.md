# S2a review r2 — APPROVE

> Written by code-reviewer (read-only this round; scratch only in session scratchpad); saved by the orchestrator.

Gate re-run by reviewer: typecheck/lint/test PASS (41 tests), eval/bench SKIPPED. Validator OK; disagreement table 5/117 (label true 8, formula true 9, both 6).

## B1 (r1) — RESOLVED
- `validate-dataset.ts:69-83` risk floors now check human `expected_volatility`; `compareOracle`/`printOracle` (`:89-105`) WARN only. SCHEMA.md: labels never edited to match the formula; S2b reports detection F1 and fusion fidelity separately.
- Re-decisions go against the formula in both directions (s01_c08 0.86, s08_c07 0.68, s10_c10 0.86 → false; s03_c07 0.39, s12_c07 0.36 → true). All defensible: recoveries into calm agreement are noise; s03_c07 is a context-only positive→sarcastic shift; s12_c07 is flat-delivery appeasement→ultimatum (cold aggression the formula can't see). No sentiment/risk labels changed; s12_c07 still critical.
- Rule is a copilot-alert definition applied consistently: all cooperative→hostile flips true; hostile-after-hostile false; all Δarousal_z ≥ 2.0 toward hostility true; recoveries false. No counter-example found.

## Non-blocking
- **N1** SCHEMA.md rule wording: say "vs this speaker's previous turn"; give "marked delivery spike" a qualitative anchor (e.g. clearly audible on ≥ 2 cues vs baseline). Edge case s15_c04 (Δ+1.64, false) defensible.
- **N2** r1 N2–N11 still open — ticket them (T8) or accept.
- **N3** Population std puts s06_c07 at 0.56 (now WARNed). S5a must pin std definition.

## Checklist
1 Lanes PASS (CLAUDE.md §7 and TASKS T7 are human-approved orchestrator edits) · 2 Contract PASS (117 rows, 89/28 split by session) · 3 N/A · 4 N/A · 5 PASS · 6 N/A · 7 Tests PASS · 8 Types PASS (T7) · 9 Security PASS · 10 Simplicity PASS

Coverage: all sentiment×speaker cells ≥ 4; risk 47/31/31/8; volatility 8/109; 4 counterfactual + 5 context-flip pairs; 24 hard negatives; 4 injections. All S2a acceptance criteria met.
