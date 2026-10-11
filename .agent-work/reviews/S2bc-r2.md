# S2b + S2c review r2 — APPROVE

> Written by code-reviewer (read-only); saved by the orchestrator.

Reviewer narrow checks: eval tests 15/15 (stats 8 + rate 7); tsc check config 0 errors under eval/; eslint and prettier clean on eval + reports; no any/ts-ignore.

## B1 (r1) — RESOLVED
`bench.ts:150-152`: `--quick` → only `reports/bench-quick.md`; full → `reports/bench-latest.md` + history; `bench-full.md` removed; report text says gate reads bench-quick, docs cite bench-latest. bench-latest = full (n 400, quick:false); bench-quick = n 50. Metrics comment gains `valid_for_latency`. **Open in backend-dev lane:** gate.mjs must read bench-quick.md, delete it before bench, fail if missing/no metrics comment.

## Regenerated reports are heuristic-only
All current reports target :3027, /health `heuristic`, "Heuristic answers 100%" (400/400+5/5, 50/50, 89/89, 15/15); `rg "llm:" reports/` → none; aborted LLM bench wrote nothing. Recomputed 42/89 strict (47.2%), 49/89 lenient (55.1%), unchanged; smoke 9/15. ai-log incident entry honest.

## r1 non-blocking
N1 rate (TPM-derived 7 RPM, UNVERIFIED label, INVALID-FOR-LATENCY), N3/N4 env-sourced with printed source, N5, N6, N7, N10 — addressed.

## New non-blocking
- **N1** `reports/eval-reference.md:6` stale RPM wording ("achieved 126610.5"); numbers unaffected; regenerate at S8b; docs must not cite that RPM.
- **N2** `env-defaults.ts:4` — eval scripts don't load the dotenv file the backend loads; tuned LLM_DEADLINE_MS / VOLATILITY_THRESHOLD set only there would make fidelity compare to the wrong threshold. Export in shell or pass flags in S8; document in SETUP.
- **N3** eval-report.ts 229 / validate.ts 208 lines.
- **N4** smoke margin still zero (9/15); S4b to add margin.

## Checklist
1 Lanes PASS · 2 Contract PASS · 3 Boundaries PASS · 4 Async PASS · 5 Failure modes PASS · 6 Latency N/A · 7 Tests PASS · 8 Types PASS · 9 Security PASS · 10 Simplicity PASS
