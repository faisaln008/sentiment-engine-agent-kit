# S2b + S2c review r1 — REQUEST_CHANGES

> Written by code-reviewer (read-only); saved by the orchestrator.

Reviewer narrow checks: eval stats tests 8/8; `tsc -p apps/backend/tsconfig.check.json` 0 errors; eslint apps/backend/eval clean; prettier on eval/reports/package.json clean. Gate eval/bench branch verified only by author (scratch gate on :3010; :3000 held by an unrelated app).

## Blocking
- **B1** `apps/backend/eval/bench.ts:194-197` (+ docstring :2, report text :175) — every run (incl. gate `--quick`) writes `bench-latest.md`, so each gate run replaces the doc-cited file with 50-sample quick numbers; handoff tells docs to cite `bench-full.md`, contradicting CLAUDE.md §2.9 and the orchestrator decision. Fix: quick → `bench-quick.md` only; full → `bench-latest.md` + history; drop `bench-full.md` (delete the file); fix docstrings/report text/handoff. Paired backend-dev change: gate.mjs reads `bench-quick.md`, deletes it before the bench step, FAILS if missing or no metrics comment (today `if (m)` passes silently, gate.mjs:38-46).

## Non-blocking
- **N1** Free-tier rate safety: default 25 RPM (run-eval.ts:23, bench.ts:21) is RPM-safe for Groq but likely ~3x over the 8b model's TPM (~700–800 tokens/request); Gemini free tier lower still. Before S3c: lower LLM default (~8 RPM) or add `--tpm`/`--tokens-per-req` deriving RPM; print the assumption; mark runs INVALID-FOR-LATENCY when provider 429 count > 0 (after R4). S3c uses `--quick`. (Limits from reviewer knowledge — re-verify.)
- **N2** Smoke threshold 0.60 (9/15): deterministic in heuristic mode → tripwire, not flake. Keep it; S4b must lift heuristic to ≥ 10/15; re-check after S3c. Never lower it to get green.
- **N3** `bench.ts:29,:182` — `--deadline-ms` default 450 duplicates config and report text is hand-typed; use `process.env.LLM_DEADLINE_MS ?? 450` and print the source.
- **N4** `eval-report.ts:209` "threshold 0.6" hand-typed; `volatility-oracle.ts:29` hard-codes 0.6 — read `VOLATILITY_THRESHOLD` with 0.6 fallback and print it.
- **N5** `eval-metrics.ts:103` — errored chunks' prev fallback acceptable; state it in the report.
- **N6** `bench-run.ts:141` — child stderr piped but never drained; use 'ignore' or drain.
- **N7** Unthrottled runs print huge "achieved RPM"; print "n/a (unthrottled)". `<` vs `<=` wording.
- **N8** eval-report.ts 228, validate.ts 208, bench.ts 206 lines — extract renderBench().
- **N9** `server-log.ts:123` fallback detection depends on log `provider` naming matching /health mode — pin with backend-dev (R4).
- **N10** `eval-metrics.ts:132` redundant cast.
- Suggest `reports/raw/bench-<label>.jsonl` for full runs so latency is auditable.

## Recomputed metrics (independent script, tune n=89) — all match report/handoff
| metric | ours-heuristic | reference |
|---|---|---|
| strict | 47.2% | 36.0% |
| lenient | 55.1% | 51.7% |
| macro-F1 | 0.351 | 0.207 |
| neutral floor | 29.2 / 43.8 | same |
| risk MAE / exact | 0.97 / 40.4% | 0.88 / 42.7% |
| volatility detection | F1 0.00 (FN5) | F1 0.80 |
| smoke lenient | 9/15 | 8/15 (floor 6/15) |

## Checklist
1 Lanes PASS · 2 Contract PASS · 3 Boundaries N/A · 4 Async PASS · 5 Failure modes PASS · 6 Latency N/A (B1, N1) · 7 Tests PASS · 8 Types PASS · 9 Security PASS (no keys/paths; raw jsonl small, no request text) · 10 Simplicity mostly PASS (N8)
Holdout guard PASS; trailing `--` in root scripts correct.
