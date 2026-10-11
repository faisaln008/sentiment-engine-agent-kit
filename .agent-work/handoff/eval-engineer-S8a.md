# Handoff — eval-engineer · S8a (prompt iterations) · 2026-10-11

Review: `.agent-work/reviews/S8a-r1.md`, verdict APPROVE. Non-blocking findings N1–N6 are addressed below.

## What changed
- **Prompt**: `apps/backend/src/llm/prompt.ts` is **unchanged**. v1.3 ships. Iteration 1 (v1.4 trim, T10) was rejected. Iteration 2 (v1.5 sarcasm definition) was reverted because the run was invalid: Groq TPD ran out mid-run. Iteration 3 was not run.
- **`reports/PROMPT_CHANGELOG.md`** covers the S8a iterations, with token counts per version, results per version and failure clusters. Review fixes:
  - N1: macro-F1 is now shown to 2 decimals (0.77 / 0.73 / 0.61), as printed in `reports/eval-s8a-v1.{3,4,5}.md`.
  - N2: "groq p50" is now the true median, and the convention is stated. Values: v1.3 = 234, v1.4 = 239.5 (n = 76, mean of the two middle values), v1.5 = 269.
  - N3: Groq deadline timeouts are 451–457 ms. Added a clause that v1.5 Gemini attempt timeouts go as low as 377 ms, because Gemini gets only the deadline left after Groq.
  - N6: added a provenance note that HEAD `927ece8` touches only `specs/SPEC.md` and `specs/TASKS.md` after `d3dc698`.
- **Evidence**:
  - `reports/eval-s8a-v1.{3,4,5}.md` and `reports/history/*-eval-s8a-v1.{3,4,5}.md`
  - `reports/raw/eval-s8a-*.jsonl` and `reports/raw/serverlog-s8a-*.jsonl` (sanitised: no text)
  - `reports/raw/llm-only-s8a-iter{1,2}.md` and `reports/raw/prompt-tokens.jsonl`
- **Eval tooling** (`apps/backend/eval/`):
  - `llm-only.ts`: compares runs on the chunks the LLM answered.
  - `prompt-tokens.ts`: measures Groq `usage.prompt_tokens`.
  - `test/per-provider.test.ts`
  - `lib/volatility-oracle.ts`: T20 epsilon fix (`v + 1e-9 >= threshold`).
- **`apps/backend/eval/injection.ts`** (N5): this is **T28 tooling, written ahead of time. It has not been run against any backend and has no unit test.** Review fixes:
  - `--rpm` is validated before any network call; NaN or ≤ 0 throws.
  - The rows no longer reuse `row[5]` for two meanings. Each `session_id` is kept in a typed `Outcome` record, and the provider column is added as its own cell when the table is built.
- **Requests**: `.agent-work/requests/eval-engineer-S8a.md`
  - R1, to backend-dev: log `usage` tokens.
  - R2, to backend-dev: bump the `PROMPT_VERSION` test assertion if a version is ever kept.
  - R3, to human: local env model mismatch, and TPD.

## How verified
The human deferred eval, eval:smoke, bench, gate and all LLM/API calls. Only these were run:
- `npm run typecheck` exited 0.
- `npm test`: Test Files 27 passed (27), Tests 245 passed (245), no network.
- `npx eslint` + `npx prettier --check` on `apps/backend/eval/injection.ts` are clean.
- I recomputed the N2/N3 numbers from the committed `reports/raw/serverlog-s8a-v1.*.jsonl` with jq. No new runs were made.

## Open risks
- **Groq org daily token quota (TPD)** ran out on 2026-10-11 at about 19:28Z. Every LLM run below needs a fresh quota window. Prompt size (about 793 to 913 tokens per request) limits throughput, which is T10.
- **R3, local env model mismatch**: the local env file selects `llama-3.1-8b-instant`, which returns 404 for this org. A plain `npm start` runs without Groq. All S8a runs used shell overrides (`qwen/qwen3.8-27b`, `reasoning_effort none`). Align the env file before S8b or the demo.
- **S8b not run**: neither the holdout nor the LLM-backed `npm run bench` has been run. No holdout or bench numbers exist for v1.3 with context.
- **v1.5 re-test is pending.** It is the most promising candidate: on the 35 chunks Groq answered, sarcastic F1 went 0.00 → 0.67, but n = 2, so this is not evidence. If it is kept, backend-dev must bump `adapter.test.ts` `PROMPT_VERSION` (R2).
- **`npm run gate` has not been run for S8a** (human deferral). Run it before calling S8a done.
- The S8a checkboxes in `specs/TASKS.md` are still unticked. That file is outside my lane, so spec-architect or the orchestrator needs to tick them.
