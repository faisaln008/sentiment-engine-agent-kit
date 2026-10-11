# ADR-005: Provider amendment after CP1 real-key checks (amends ADR-001)
Date: 2026-10-11 · Status: accepted as an amendment to [ADR-001](001-provider-strategy.md) — config defaults and A/B arms only.
The frozen API contract (SPEC §2, `packages/contracts`) is **unchanged**. The chain structure from ADR-001 is unchanged too: sequential fallback, no timer hedge, deadline from t0 → heuristic.

## Context
ADR-001 picked `llama-3.1-8b-instant` as primary and listed several provider facts as UNVERIFIED. During S3, backend-dev ran checks with the human's real keys. That evidence is in `.agent-work/handoff/backend-dev-S3.md`: about 30 real calls plus one throttled `bench --quick` (n = 50, 7 RPM).
The checks show that the ADR-001 primary is **unusable with this key**. They also show that the Gemini fallback is too slow to beat the 450 ms deadline.

## Verified facts (moved out of UNVERIFIED; source: backend-dev-S3 handoff, 2026-10-11, this org's keys)

| Fact | Evidence | Scope / caveat |
|---|---|---|
| `llama-3.1-8b-instant` and `llama-3.3-70b-versatile` → 404 `model_not_found`; absent from `GET /models` | real calls | **This key/org only.** The Groq models page still lists both as Production, so evaluator keys may differ |
| Accessible Groq chat models for this key: `openai/gpt-oss-20b`, `openai/gpt-oss-120b`, `openai/gpt-oss-safeguard-20b`, `qwen/qwen3.8-27b`, `allam-2-7b` | `GET /models` | this key/org |
| `qwen/qwen3.8-27b` with `reasoning_effort:"none"` + `include_reasoning:false`: 282 ms (cold), 47 completion tokens, `finish_reason:stop`, valid JSON, correct label | real call | **n = 1**. Promising, not a measurement |
| `openai/gpt-oss-20b` with no effort set: reasoning uses all 90 tokens → `finish_reason:length` → 400 `json_validate_failed` | real calls | answers the ADR-001 UNVERIFIED row: reasoning tokens **do** count against the completion budget |
| `openai/gpt-oss-20b` with effort `low`: `finish_reason:length` in 23/50 (46%); quick bench p50 425 / p95 488 ms; 84% heuristic; 40% deadline timeouts | bench `--quick`, n = 50, 7 RPM | p50 is mostly the deadline firing, not model latency. **Fails the 250 ms p50 budget** |
| Gemini compat accepts `response_format:{type:"json_object"}` for `gemini-3.5-flash-lite`; 42–58 completion tokens; `finish_reason:stop` | 8 real calls | answers the ADR-001 UNVERIFIED row |
| `gemini-3.5-flash-lite` latency 580–1170 ms per call | 8 real calls | network/region of the human's machine |
| Gemini 2.5 models **are** visible to this key | real `models` listing | contradicts ADR-001's worry for *this* key. Google docs still say 2.5 is limited to prior users, so a fresh evaluator key may not see it |
| Groq org limit 8000 TPM (from the 429 body) | real 429 | at ~760 tokens/request ≈ **10 RPM ceiling** for this org |
| Prompt v1 is ~680 system + ~80 user ≈ 760 prompt tokens (Gemini `prompt_tokens` 758–763) | provider usage fields | above the ~550-token target |

Still UNVERIFIED: evaluator-key model access and limits; qwen latency and quality beyond n = 1; and `qwen/qwen3.8-27b` lifecycle. The Groq models page (read 2026-10-11, ADR-001 evidence) lists qwen3.8-27b under **Preview**: "may be discontinued at short notice".

## Decision
1. **Primary candidate: `qwen/qwen3.8-27b` with `LLM_PRIMARY_REASONING_EFFORT=none`** (+ `include_reasoning:false`, already sent by the adapter when an effort is set on Groq). **A/B challenger: `openai/gpt-oss-20b` with effort `low`.**
2. **S3c decides the final default.** eval-engineer runs both arms on the tune split, throttled to stay under 8000 TPM, with the same prompt version and `max_tokens`. backend-dev changes `.env.example` defaults only after the A/B. This ADR does not change config.
3. **Human Q2 is preserved.** The A/B still runs "regardless of nuance scores". Only the llama arm is replaced by qwen, because llama is inaccessible to this key.
4. **Evaluator portability.** The default must be a model the *evaluator's* key is likely to have. SETUP.md (docs-writer) must say that Groq model access differs per org, name the alternatives (`llama-3.1-8b-instant` where accessible; `openai/gpt-oss-20b` with effort low), and explain `LLM_PRIMARY_MODEL` / `LLM_PRIMARY_REASONING_EFFORT`.
5. **Gemini fallback latency is an S4a design input** (decided by the human and backend-dev in S4a, not here):
   - **Option A: a faster Gemini model.** Candidate `gemini-2.5-flash-lite` (thinking off by default per Google docs, visible to this key). Measure n ≥ 10 calls first. Risk: fresh evaluator keys may lack 2.5 access, and it is a config default, so the 3.5 model stays a documented alternative.
   - **Option B: accept limited coverage.** The fallback mainly covers outright primary errors (fast 429/401/5xx, open circuit), when it gets ~400 ms of remaining budget. A slow primary still ends in the heuristic at the deadline. Bench shows how often the fallback actually wins.
   - Option C (noted, not recommended): a second Groq model as fallback. It shares the same org's 8000 TPM, so it does not help against 429s.
   - Recommendation: **measure A at S4a; if 2.5-flash-lite p50 ≤ ~350 ms, use it as the default fallback, else take B.** Either way the deadline → heuristic rule stays.

## Consequences
- **Throughput is now a top risk.** 8000 TPM at ~760 tokens is about 10 RPM for this org; a harness burst above that goes to the heuristic. Levers:
  - trimming the prompt toward ≤ 550 tokens (eval-engineer, S8a; must not drop the contrastive few-shots without an eval gain)
  - the breaker skipping instantly on 429
  - S4b heuristic quality
- The CP1 checkpoint (PLAYBOOK 3:20) uses S3c's report, not the ADR-001 assumptions.
- If qwen wins but stays Preview, record the discontinuation risk in ARCHITECTURE.md limitations and keep gpt-oss-20b as the documented alternative.
- Not decided here, flagged for the owners: Node engine bump for undici 7 (backend-dev, root `package.json`); the 400 retry without `response_format` currently fires on *any* 400 (backend-dev, S4a review item).

## Evidence
- `.agent-work/handoff/backend-dev-S3.md` (real-key smoke + quick bench, 2026-10-11).
- Groq models page (Preview status of `qwen/qwen3.8-27b`) and reasoning page (`none` documented for Qwen 3.8 27B only): https://console.groq.com/docs/models, https://console.groq.com/docs/reasoning — accessed 2026-10-11 (ADR-001).
- Google 2.5 access note: https://ai.google.dev/gemini-api/docs/deprecations — accessed 2026-10-11 (ADR-001).
