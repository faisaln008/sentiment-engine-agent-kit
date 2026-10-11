# Prompt changelog

Rule (eval-methodology): one hypothesis, one change in `apps/backend/src/llm/prompt.ts`, re-run the **tune** split,
keep iff macro-F1 ↑ **and** eval p50 Δ < +20 ms. Holdout is never used here (S8b).

## S8a — 2026-10-11 (eval-engineer)

**Setup, identical for every run.** The model is `qwen/qwen3.8-27b` with `reasoning_effort` set to `none`, per ADR-005. Model and effort were passed as shell overrides to a fresh server per run on :3027, built from HEAD `d3dc698` plus the prompt edit under test. (Provenance: the current HEAD `927ece8` changes only `specs/SPEC.md` and `specs/TASKS.md` after `d3dc698` — docs/spec-only, so the runs apply to it unchanged.) All runs use the tune split (89 chunks, 12 sessions) with session context on (S5), throttled to 7000 TPM / 913 tokens per request, which gives 7 RPM. Sessions run in parallel (at most 4).

Groq deadline timeouts land at 451–457 ms (`reports/raw/serverlog-s8a-*.jsonl`), consistent with `LLM_DEADLINE_MS` 450. Gemini attempt timeouts in v1.5 go as low as 377 ms because Gemini only gets the deadline remaining after the Groq attempt. `max_tokens` was not observed; the `.env.example` default is 90, and the server env file was not inspected.

**Evidence.** All files are under `reports/`:
- eval reports `eval-s8a-v1.{3,4,5}.md`, plus history copies;
- raw predictions `raw/eval-s8a-v1.{3,4,5}.jsonl`;
- sanitised server logs `raw/serverlog-s8a-v1.{3,4,5}.jsonl`;
- LLM-only comparisons `raw/llm-only-s8a-iter{1,2}.md`, made by `apps/backend/eval/llm-only.ts`;
- token counts `raw/prompt-tokens.jsonl`, made by `apps/backend/eval/prompt-tokens.ts`. These are Groq `usage.prompt_tokens` values from `max_tokens:1` calls on fixed invented inputs. "System" means the system prompt plus a user message of ".", so it includes the chat template.

### Prompt size per version (Groq-measured)
| version | system chars | system tokens | no context | 3 context turns |
| --- | --- | --- | --- | --- |
| v1.3 (shipped) | 2792 | not measured (≈ 752 by difference*) | 793 | 913 |
| v1.4 (rejected) | 2535 | 701 | 742 | 862 |
| v1.5 (reverted) | 2961 | 785 | 826 | 946 |

\*The no-context user block costs 742 − 701 = 41 tokens on v1.4 (the user block is identical across versions), so v1.3's system cost ≈ 793 − 41 = 752. This is an inference, not a measurement.

### Results (tune, n 89)
Columns:
- **all**: every chunk, including the ones the heuristic answered after a deadline timeout.
- **LLM**: only chunks Groq answered.
- **p50/p95**: client latency during the eval, not a bench.
- **groq p50**: true median of server-logged `latency_ms` of Groq-answered chunks (mean of the two middle values when n is even).
- **macro-F1**: 2 decimals, exactly as printed in the committed `eval-s8a-v1.X.md` reports.
- **429**: Groq attempts rejected with 429 (`llm attempt failed` lines in the sanitised log); the eval report counts only the final per-chunk reason.

| version | macro-F1 (all) | strict / lenient (all) | nuance strict | LLM n · strict / lenient | p50 / p95 ms | groq p50 | heuristic · timeouts · 429 | decision |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| v1.3 baseline | **0.77** | 77.5% / 95.5% | 83.9% | 86 · 77.9% / 96.5% | 243 / 392 | 234 | 3 · 3 · 0 | baseline |
| v1.4 trim (iter 1) | 0.73 | 74.2% / 87.6% | 80.6% | 76 · 78.9% / 93.4% | 260 / 464 | 239.5 | 13 · 13 · 0 | **reject** |
| v1.5 sarcasm def (iter 2) | 0.61 | 62.9% / 79.8% | 61.3% | 35 · 74.3% / 97.1% | 308 / 463 | 269 | 54 · 32 · 6 Groq attempts 429 `TPD` (1 as final chunk reason) + 21 circuit-open | **revert (invalid run)** |

The groq p50 column comes from `jq -r 'select(.msg=="chunk" and .provider=="groq") | .latency_ms' reports/raw/serverlog-s8a-v1.X.jsonl` (median).

### Baseline — v1.3 (prompt unchanged since 1bac0a3)
These are the first LLM numbers on v1.3 with session context; per T20, the CP1 numbers (v1.1, no context) no longer apply.

Failure clusters:
- **(A) Sarcasm recall is 3/8.** Misses go to negative ×2, positive, deflecting and aggressive. Examples: s03_c07 "Sounds great." after a complaint → positive, and s08_c05 / s13_c02, which are complaints voiced as praise, → negative.
- **(B) Candidate proposals and offers are labelled positive instead of neutral** (neutral→positive ×4).

Volatility fusion fidelity is 100% against the oracle, with the T20 epsilon fix applied.

### Iteration 1 — v1.4: trim (T10)
- **Hypothesis.** A shorter system prompt cuts p50 and TPM pressure with no macro-F1 loss.
- **Change.** Terser label/format lines and shorter few-shot texts and mitigations. All 5 contrastive few-shots, their acoustic cues and the untrusted-`<<< >>>` sentence are kept verbatim. This cut the system prompt by 257 chars, the no-context prompt by 51 tokens (−6.4%), and the system part to about 701 tokens. That is still about 150 tokens over the ≤ 550 target; reaching the target would mean dropping roughly 2 few-shots, which is a separate hypothesis (ADR-005 forbids it without an eval gain).
- **Result.**
  - Headline macro-F1 fell from 0.77 to 0.73, and p50 rose by 17 ms (243 to 260).
  - Most of the headline drop is deadline noise: there were 13 timeouts, against 3 for v1.3.
  - On the 74 chunks Groq answered in both runs (`raw/llm-only-s8a-iter1.md`), macro-F1 is equal (0.79 vs 0.79) and strict is 81.1% → 79.7%.
  - Lenient fell 97.3% → 93.2%, which is 3 chunks; positive F1 fell 0.85 → 0.75.
  - Groq-answered p50 is 234 → 239.5 ms. Removing 51 tokens bought no measurable latency.
- **Decision: REJECT.** macro-F1 did not improve, and there was no latency gain to trade against the lenient loss.

### Iteration 2 — v1.5: sarcasm definition (cluster A)
- **Hypothesis.** Sarcasm misses happen because the definition does not say that a complaint voiced as praise is sarcastic, not negative. This targets 4 chunks (s03_c07, s08_c05, s09_c04, s13_c02), not one.
- **Change.** One line, built on v1.3 and using the taxonomy's own cue list: `sarcastic: literal meaning opposite to intended: praise or agreement contradicted by context (prior complaint, bad offer), exaggerated intensifiers (sure, totally, obviously), mock concession. A complaint voiced as praise is sarcastic, not negative.` This added 33 tokens.
- **Result: the run is invalid.** The Groq org's **daily token quota (TPD) ran out mid-run**: 6 × 429 with `limit:"TPD"` and retry-after of 216–337 s. The breaker opened, the heuristic answered 54 of 89 chunks (32 timeouts and 21 circuit-open), and groq p50 rose to 269 ms.
  - On the 35 chunks Groq answered in both runs (`raw/llm-only-s8a-iter2.md`), macro-F1 was 0.71 → 0.81 and sarcastic F1 was 0.00 → 0.67. But sarcastic has only n = 2 in that set, so this is **not evidence**.
- **Decision: REVERT to v1.3.** The rule's headline macro-F1 fell (0.77 → 0.61). Re-test v1.5 unchanged when the quota resets; it is the most promising candidate.

### Iteration 3 — not run
Per the S8a constraint, all LLM traffic stopped on TPD exhaustion. Planned next candidates:
1. Re-run v1.5.
2. Cluster B: neutral covers offers and proposals stated without evaluation.
3. A deeper T10 trim that drops 2 few-shots.

### Shipped prompt after S8a: **v1.3, unchanged**
Labels are unchanged; no dataset edits were made in S8a. Holdout was not run.
