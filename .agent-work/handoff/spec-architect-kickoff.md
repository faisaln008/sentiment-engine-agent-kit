# Handoff — spec-architect · kickoff FINAL (2026-10-11) — FROZEN

## Status
SPEC.md, TASKS.md and the contracts are **FROZEN 2026-10-11** (human decisions relayed by the orchestrator). ADR-001..004 accepted.
Contract changes now need a new ADR + explicit human approval (`.agent-work/requests/contract-change-<n>.md`).

## Human decisions applied
Q1 fallback `gemini-3.5-flash-lite` · Q2 mandatory CP1 A/B 8B vs gpt-oss-20b (new task S3c, eval lane) · Q3 `""` and whitespace-only text → 200 neutral (`isBlankText`, tests in S1b) · Q4 WS `timestamp_ms` yes · Q5 ≥ 80 chunks / 10 sessions · Q6 volatility normalisation yes + worked-example unit tests in S5b · Q7 id limit **512** · Q8 moot.
H1 cache cut (S7b, `CACHE_SIZE`, pipeline step 4) · H2 override: sequential fallback on error/429/circuit-open, no timer hedge, deadline from t0 → heuristic, `LLM_HEDGE_AFTER_MS` removed · H3 paired reviews · H4 S10 second cut until CP2 · H5 S9 cut, basic demo button in S6c.

## Files changed in this pass
- `specs/SPEC.md`, `specs/TASKS.md`, `specs/adr/001..004`
- `packages/contracts/src/telemetry.ts`, `ws.ts`, `index.ts`
- `.env.example` (one-time human grant)

## Lane minutes (implementation)
backend 255 (+≈65 review ⇒ ≈320 of 350 effective, 91%) · eval 185 (77%) · frontend 135 (50%) · total 575.

## Verification / open risks
- Contracts still not compiled (no install). S0 compiles them unchanged; errors → contract-change request.
- CLAUDE.md §3 pipeline step 4 (cache) and any `LLM_HEDGE_AFTER_MS` / hedging mention in CLAUDE.md §1/§3/§6 and in skills (llm-provider-integration, latency-engineering) are now stale — orchestrator is editing CLAUDE.md; skills are human-owned (requests filed for latency-engineering).
- S3a adds two optional env names (`LLM_*_REASONING_EFFORT`) to `.env.example` for a fair CP1 A/B — backend-dev lane (root config).
- Risks: free-tier rate limits under harness load; 8B nuance quality; Groq latency; slow-but-alive Groq now yields heuristic answers (H2); self-labelled data bias.

## Open questions
None blocking. READY FOR FREEZE: **done — FROZEN**.
