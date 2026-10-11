# S3c review r1 — REQUEST_CHANGES

> Written by code-reviewer (read-only); saved by the orchestrator. Scope: CP1 A/B deliverables only.

Reviewer checks: tsc check config 0 errors; eslint eval clean; prettier clean; eval vitest 15/15. No gate, no provider calls.

## Independent recomputation (reviewer's own script from raw jsonl + tune + arm server logs) — all match
qwen strict/lenient 76.4/87.6, macro-F1 0.753, nuance 80.6/87.1, LLM-only n 82 / 0.81, heuristic 7/89, reasons timeout 7; bench 249/453/478 valid. gpt-oss 47.2/53.9, 0.335, nuance 16.1/19.4, LLM-only n 13 / 0.47, heuristic 76/89, bad_json 33 + timeout 43; bench 400/461/469 invalid (5×429); r2 rate_limited 48. Per-class F1 all match.

## Blocking
- **B1** `reports/ab-cp1.md:3,22-28` + `apps/backend/eval/ab-compare.ts:3-7` — decisive inputs (qwen bench p50 249 valid; all log-derived rows) exist only in ephemeral scratchpad files; `reports/bench-quick.md` now holds the invalid r2 run. Not reproducible (CLAUDE.md §2.9). Fix: copy bench-quick reports to `reports/raw/bench-ab-{qwen,gptoss,gptoss-r2}.md`; commit sanitised per-chunk log extracts `reports/raw/serverlog-ab-<arm>.jsonl` (keep chunk_id, session_id, provider, latency_ms, outcome, reason, finish_reason, status + warm-up lines; drop hostname, pid, "Server listening at http://192.168…" LAN IP); re-run ab-compare on committed paths; print the exact invocation in the report header.
- **B2** `ab-cp1.md:103,120`, `requests/eval-engineer-S3c.md:15`, `handoff/eval-engineer-S3c.md:52`, `ai-log.md:25` — "gpt-oss ~1010–1040 prompt tokens / ~30% higher" was measured on the old pre-trim prompt (Gemini counted 954–959 on the same prompt, gap ~7–9%); no v1.1 measurement exists; "qwen fits 850" unmeasured. Fix: 5×429 cause unexplained (reasoning tokens toward TPM / TPD exhaustion / tokenizer); remove both claims or cite measurements; correct the ai-log lesson ("size per model from measured prompt_tokens for the current prompt").
- **B3** `ab-cp1.md:30,106,115`, `handoff:24,68`, `requests:4` — "only arm that satisfies p50 < 250" overstates: n 50 median CI ≈ 234–268 ms (bootstrap), P(median ≥ 250) ≈ 0.49; gate (`p50 ≤ 250`) will flip ~50% with qwen live. Use the reviewer's wording ("on the budget… met only nominally, not demonstrated… choice does not depend on it… 'at budget' until S8a trims the prompt and a full bench (n 400) runs"); ab-compare rule line prints margin and n; attribute the "no 429" condition to the author's validity rule.

## Non-blocking
- **N1** `ab-cp1.md:113` per-class wording (all-chunk: qwen wins all 7; LLM-only: neutral tie, negative to gpt-oss on n=1).
- **N2** `ab-compare.ts:159-168` per-arm support; "—" for classes outside macro set; print macro class count (gpt-oss LLM-only macro averages 5 classes).
- **N3** hand-typed "n 89" (`:118`) and "LLM_DEADLINE_MS 450" (`:185`).
- **N4** `ab-compare.ts:48` unchecked cast of metrics JSON — zod.
- **N5** `:196` missing `--notes` path silently dropped — throw.
- **N6** `:89` LLM-only = `provider === 'groq'`; use `!== 'heuristic'` before reuse in S8.
- **N7** double log parsing / duplicate key building.
- **N8** inline undercount caveat on finish_reason:length cells.
- **N9** inline INVALID on gpt-oss latency cell.
- **N10** strengthen arm-A provenance: single warm-up line + prompt.ts unchanged 8e46c2a..070e52b, first change at 6c333e5 after arm A ended.
- **N11** `apps/backend/src-ab8e46/` was a temporary out-of-lane write (deleted, never staged); next time use the scratchpad.
- **N12** tests for perProvider, reasons, winner (move winner to lib/).
- **N13** (backend-dev) `scripts/gate.mjs:55` uses `p50 <= 250`; CLAUDE.md says p50 < 250 — align.

## Checklist
1 Lanes PASS (N11) · 2 Contract N/A · 3 Boundaries PASS · 4 Async N/A · 5 Failure modes PASS (N5) · 6 Latency FAIL (B3) · 7 Tests PARTIAL (N12) · 8 Types PASS (N4) · 9 Security PASS (B1 must sanitise logs) · 10 Simplicity PASS

Comparability: same deadline/max_tokens/throttle/port; prompt v1.1 both arms; fallback key not blanked in arm A but harmless (8e46c2a server has no fallback wiring; 0 non-groq answers); tree inference sound but not provable (disclosed).
