# docs-writer ship handoff

---

## Final-review fixes — 2026-10-11 (docs-writer, third pass — READY-WITH-NITS resolution)

### Changes applied (file : before → after)

| File | Line | Before | After | Source |
| --- | --- | --- | --- | --- |
| ARCHITECTURE.md | ~120 | `macro-F1 0.767 → 0.727` | `0.77 → 0.73` | reports/PROMPT_CHANGELOG.md (Results table, 2-decimal column); reports/eval-s8a-v1.{3,4}.md |
| ARCHITECTURE.md | ~49 | `Groq-answered p50 235 vs 240 ms` | `234 vs 239.5 ms` | reports/PROMPT_CHANGELOG.md (true-median groq p50 per N2 fix) |
| ARCHITECTURE.md | ~58 | `244 tests passed at the audit-fix handoff ([handoff]…)` | `245 tests / 27 files passed at the S8a-r1 reviewer run ([S8a-r1]…)` | .agent-work/reviews/S8a-r1.md |
| ARCHITECTURE.md | ~39 | `p50 681 ms, p95 852 ms warm (12 calls, …)` | `p50 681 ms all calls, warm p50 660 / p95 852 ms (12 calls, …)` | .agent-work/handoff/backend-dev-S4a.md (ADR-005 §5 measurement table) |
| AI_COLLABORATION.md | ~44 | `26 entries` | `27 entries` | ai-log.md (27th entry is the correction line) — already correct in the file; StrReplace no-op |
| .agent-work/ai-log.md | last | (end of file) | Appended correction line noting count is 27 and clarifying that eval-engineer's "235 → 240" wording is left as-is (their scratch calc; ARCHITECTURE.md uses true-median values) | — |
| .agent-work/handoff/docs-writer-claims.md | last row | `26 entries` | `27 entries` | ai-log.md |

### Verification
- `npx prettier --check README.md SETUP.md ARCHITECTURE.md AI_COLLABORATION.md` → **All matched files use Prettier code style!**
- `grep 0.767 / 0.727 / "235 vs" / "244 tests"` across all four docs → **none** (all stale values removed)

---

## Finalize pass — 2026-10-11 (docs-writer, second pass)

### What changed per file

**README.md**
- Removed the TODO(evidence) block (~3 lines). The brief's exact four quickstart commands (`npm install`, `cp .env.example .env`, `npm start`, `npm run dev:frontend`) match our `package.json` and SETUP.md verbatim. No other changes.

**SETUP.md**
- T23: Strengthened the qwen/qwen3.8-27b model table entry to note that "not all Groq orgs can access it" and direct evaluators to `LLM_PRIMARY_MODEL` overrides.
- T26: Expanded the "Network exposure and security notes" section to explicitly state in one paragraph that `HOST=0.0.0.0` exposes "an unauthenticated, un-rate-limited API and a global WebSocket broadcast", and that the WS broadcast is cross-session by design.
- T14: Already covered in the "Gemini-only deployments" section (no change needed).

**ARCHITECTURE.md**
- T16: Expanded the heuristic-mode known-limitations row to include: sarcastic F1 0.00 (already present), benign deferrals → deflecting/medium (already present), tune figures fitted (already stated), and added the smoke threshold fact: "`eval:smoke` threshold (9/15 lenient correct) equals the heuristic's current floor — treat it as a regression tripwire, not a quality bar". Source: S4b-r2 non-official holdout check.
- No other changes.

**AI_COLLABORATION.md**
- Updated stale "30 lines" ai-log count to "26 entries" (actual count of entries verified in the file).
- Added two missing S8a entries to the "Where AI failed" table:
  1. `prompt-tokens.ts` measured the wrong model (env mismatch → 404 probes) — detected by the `HTTP 404, no usage` output; fix: shell overrides + human notified.
  2. Wait-loop grep matched the start banner (0 s wait) — detected by missing result line; fix: changed grep target to `eval: wrote`.
- (The third S8a entry — trim not cutting p50 / TPD exhaustion — was already in the draft.)

### Tickets covered in this pass
| Ticket | Status |
|---|---|
| T14 | Was already covered in SETUP.md (Gemini-only section). Confirmed, no change. |
| T16 | ARCHITECTURE.md known-limitations row now includes sarcasm F1 0.00, benign deferral mapping, fitted tune figures, and smoke-threshold = heuristic floor (9/15). |
| T23 | SETUP.md model table now explicitly flags evaluator-key access risk for the Preview model. WS cross-session broadcast note was already present; reinforced in T26 rewrite. |
| T26 | SETUP.md security notes rewritten to say in one clear sentence that HOST=0.0.0.0 exposes unauthenticated, un-rate-limited API + global WS broadcast. |

### Verification
- `npx prettier --check README.md SETUP.md ARCHITECTURE.md AI_COLLABORATION.md` → **All matched files use Prettier code style!**
- Link check (python3 regex over relative markdown links): **96 links OK, 0 BROKEN**
- Mermaid diagram: extracted and visually verified; valid `flowchart LR` syntax.
- Numbers: all claims re-verified against source files listed below. No new invented numbers. The v1.5 invalid run note (TPD) and shipped prompt (v1.3) are accurately stated.

### Remaining items (human only)
1. **Screenshot**: the screenshot linked in README.md is `.agent-work/handoff/frontend-dev-S6c-screenshot.png` — taken against the reference backend before the WS gateway. Retake against the live backend after a `npm run simulate` run if desired.
2. **S8b not run**: holdout eval and LLM-mode bench are still deferred. `reports/eval-latest.md` and `reports/bench-latest.md` are heuristic-mode runs; this is now clearly documented in both ARCHITECTURE.md and README.md. The docs contain `TODO(evidence): run npm run eval` in neither file — they instead state the gap plainly.
3. **Local env model mismatch** (R3): `.env` on the dev machine still selects `llama-3.1-8b-instant`. Align before the demo or S8b.
4. **v1.5 re-test**: pending a fresh Groq daily quota window (see PROMPT_CHANGELOG.md).
5. **TASKS.md S8a checkboxes**: still unticked (not docs-writer's lane).

---


Wrote: README.md (56 lines), SETUP.md (97), ARCHITECTURE.md (145), AI_COLLABORATION.md (74). No code, specs, eval, bench or gate run.

## Unsourced / needs human
- TODO(evidence) README quickstart: the brief's "exact 4 commands" were not available (assignment not read). Used npm install / cp .env.example .env / npm start / npm run dev:frontend; confirm against the brief.
- Screenshot is `.agent-work/handoff/frontend-dev-S6c-screenshot.png` (reference backend, pre-WS). No screenshot against our backend exists; retake after a live run if wanted.
- Not measured, stated as such: holdout eval, LLM-mode bench. Ollama, Cerebras untested (ADR-001 UNVERIFIED).
- `reports/eval-latest.md` is labelled `heuristic-s4b`; `bench-latest.md` is `ours-heuristic` (git history of the code it ran on not checked).
- Reviewer-only note: S8a-r1 N1 says PROMPT_CHANGELOG 3-decimal macro-F1 (0.767) is not traceable to reports; docs use the 2-decimal report value 0.77.

## Claims with numbers and sources
| Claim | Source |
|---|---|
| LLM tune macro-F1 0.77, strict 77.5, lenient 95.5, nuance 83.9/96.8, risk MAE 0.36 / exact 67.4, vol F1 0.73, fidelity 100 | reports/eval-s8a-v1.3.md |
| Per-class F1 (0.81/0.64/0.74/0.50/0.86/0.82/1.00), confusion neutral→positive 4, sarcastic recall 3/8, slices (sudden-shift 60%, contradict 62.5/100, 18 hard-neg), pairs (1/4 context-flip, 3/4 counterfactual), confidence 0.91/0.86, Wilson 67.8-85.0 | reports/eval-s8a-v1.3.md |
| Eval client p50/p95 243/392; max 488; provider mix groq 86 / heuristic 3 / 429 0 / gemini 0 | reports/eval-s8a-v1.3.md |
| Reference: macro-F1 0.21, strict 36.0, lenient 51.7, nuance 0.0/9.7, MAE 0.88, exact 42.7, vol F1 0.80, fidelity 93.3, floor 29.2/0.06 | reports/eval-reference.md (and Δ columns in the two reports above) |
| Heuristic: 0.52, 59.6, 69.7, nuance 45.2/45.2, MAE 0.70, exact 51.7, vol F1 0.57, sarcastic F1 0.00, aggressive recall 0.29 | reports/eval-latest.md |
| Heuristic bench p50/p95/p99 1/10/13, n 400 | reports/bench-latest.md |
| qwen v1.1 A/B: macro-F1 0.75, bench quick 249/453 n 50; gpt-oss 0.33, 85.4% heuristic; gpt-oss 5 x 429 | reports/ab-cp1.md |
| Prompt tokens 793 no context / 913 with 3 turns; trim −51 tokens, groq p50 235→240; v1.4 0.767→0.727; v1.5 invalid, TPD 6 x 429; ~752 system tokens (inferred) | reports/PROMPT_CHANGELOG.md |
| Org 8000 TPM; Gemini 580-1170 ms (8 calls); 404 for llama | specs/adr/005-provider-amendment-cp1.md |
| Gemini p50 681 / warm p95 852 (12 calls) | .agent-work/handoff/backend-dev-S4a.md |
| Dataset 117 chunks (tune 89 / 12 sessions, holdout 28 / 3 sessions), 7 injection cases | `wc -l`/node count of apps/backend/eval/datasets/*.jsonl; .agent-work/security/injection-cases.jsonl |
| TPD exhaustion, retry-after 216-337 s, env file mismatch | .agent-work/requests/eval-engineer-S8a.md R3, PROMPT_CHANGELOG |
| Heuristic holdout strict flat 46.4% (reviewer, non-official), 26 markers | .agent-work/reviews/S4b-r2.md, .agent-work/handoff/backend-dev-S4b.md, ai-log |
| 244 tests (audit-fix handoff), 245 tests / 27 files (S8a-r1) | .agent-work/handoff/backend-dev-audit-fixes.md, .agent-work/reviews/S8a-r1.md |
| 1.10 GB for 1000 sessions; audit r1 1 high resolved; r2 0 critical / 0 high | .agent-work/security/audit-r2.md |
| Reviews: 27 files, 16 first-round, 12 REQUEST_CHANGES / 4 APPROVE | .agent-work/reviews/ (counted by verdict line) |
| Defaults 450 ms, 90 tokens, 16 in-flight, circuit 3 / 15 s, 1000 sessions, 30 min TTL, 50 WS clients, 3 context turns | .env.example, ADR-001, ADR-004 |
| ai-log 30 lines | .agent-work/ai-log.md |
