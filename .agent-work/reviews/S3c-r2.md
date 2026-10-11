# S3c review r2 — APPROVE

> Written by code-reviewer (read-only); saved by the orchestrator. Final loop.

Reviewer checks: tsc check config 0; eslint eval 0; prettier clean; eval vitest 18/18. Regeneration in a scratchpad mirror with the header invocation (no LLM calls): byte-identical to committed `reports/ab-cp1.md` except the "Generated" timestamp (seeded bootstrap).

## r1 blocking — RESOLVED
- **B1** evidence committed (`reports/raw/bench-ab-*.md`, `reports/raw/serverlog-ab-*.jsonl`, `reports/raw/ab-cp1-notes.md`); extracts identical to originals projected on kept fields (140/140/51 lines); sanitised (no hostname, pid, reqId, LAN IP, keys).
- **B2** token claims removed from S3c artefacts; 429 cause stated as unexplained; 850 tokens labelled an assumption; ai-log lesson corrected. **Follow-up (spec-architect):** `specs/adr/005-provider-amendment-cp1.md:50` still says gpt-oss "costs ~30% more tokens per request".
- **B3** "at budget: met only nominally, not demonstrated"; rule line prints margin + n; server-side CI labelled dispersion only.

## New non-blocking
- **N1** `ab-compare.ts` 275 lines — move summaryTable/perClass to `lib/ab-report.ts`.
- **N2** `ab-compare.ts:36,263` deadline from CLI default — derive from bench report or fail on mismatch.
- **N3** `ab-compare.ts:18` re-parses server log; add latency_ms to ServerLog entries.
- **N4** `perProvider()` lacks a direct unit test.
- **N5** arm-A provenance: add the S4a warm-up-every-provider argument (optional).

## Checklist
1 Lanes PASS · 2 N/A · 3 PASS · 4 N/A · 5 PASS · 6 PASS · 7 PASS · 8 PASS · 9 PASS · 10 PASS (N1)
