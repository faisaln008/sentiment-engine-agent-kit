# ADR-001: LLM provider strategy — Groq primary, Gemini fallback, heuristic last
Date: 2026-10-11 · Status: accepted (frozen with SPEC.md 2026-10-11; human override H2 applied — no timer hedge)

## Context
Classification needs semantic understanding (sarcasm, deflection, appeasement) at p50 < 250 ms / p95 < 500 ms,
at zero cost, with evaluator-supplied keys of unknown tier and region. The automated harness may stream chunks
faster than a free tier's RPM. The endpoint must never 5xx because of the LLM (CLAUDE.md §2.3).

## Options considered
| Option | Pros | Cons | Latency | Cost | Quality |
|---|---|---|---|---|---|
| A. Groq only | Very fast inference (vendor-stated 560 T/s for `llama-3.1-8b-instant`, 1000 T/s for `openai/gpt-oss-20b`) | Single point of failure; free-tier RPM unknown for the evaluator | Best (UNVERIFIED for our prompt until CP1) | Free tier | 8B-class: weakest on sarcasm |
| B. Gemini only | Large free tier historically; strong models | Thinking cannot be fully disabled on 3.x models; slower TTFT expected | Worse (UNVERIFIED) | Free tier | Better |
| C. Local Ollama 1–3B | No rate limits, no network | Evaluator must install it; quality of 1–3B on sarcasm is poor | Machine-dependent | Free | Poor |
| D1. Groq → Gemini with timer hedge → heuristic | Slow primary can be rescued by fallback | Timer + race code; with hedge 300/deadline 450 the fallback gets ≤ 150 ms (review N8), likely too little for Gemini | p50 = Groq; p95 bounded by deadline | Free (extra calls on hedge) | Groq quality |
| **D2. Groq → Gemini on error/429/circuit-open only → heuristic at deadline** | Simplest chain; never spends quota on a speculative second call; bounded worst case | A slow-but-alive Groq ends in heuristic, not Gemini | p50 = Groq; p95 bounded by deadline | Free | Groq quality; heuristic on deadline |
| E. Parallel race on every request | Lowest p50 | Doubles RPM usage → hits free-tier limits twice as fast | Best | 2x quota | Same |

## Decision
**D2** (human decision H2, 2026-10-11, overriding spec-architect's D1 recommendation). One OpenAI-compatible adapter (`POST {baseUrl}/chat/completions`, native `fetch`, keep-alive), instantiated twice from env:

| Role | Base URL | Default model | Notes |
|---|---|---|---|
| primary | `https://api.groq.com/openai/v1` | `llama-3.1-8b-instant` | Production model, non-reasoning. **Mandatory CP1 A/B** (human Q2) vs `openai/gpt-oss-20b` with `reasoning_effort:"low"` + `include_reasoning:false` via optional `LLM_PRIMARY_REASONING_EFFORT` (S3a); reasoning tokens may consume `max_tokens` — measured in the A/B. Winner set via `LLM_PRIMARY_MODEL`; this ADR amended with the report link. |
| fallback | `https://generativelanguage.googleapis.com/v1beta/openai` | **`gemini-3.5-flash-lite`** (`.env.example` updated 2026-10-11; ID verified by the human) | 2.5 models are restricted to users who used them before → an evaluator's fresh key may be refused. 3.5 Flash-Lite is Stable and defaults to `minimal` thinking. |
| last | in-process heuristic | — | Always `ok:true`, confidence ≤ 0.6. |

Request body: `{model, temperature:0, max_tokens:LLM_MAX_TOKENS(90), response_format:{type:"json_object"}, messages}`.
If a provider rejects `response_format` (HTTP 400), retry once without it and rely on `parse.ts`, logged once (skill rule).
**Sequential fallback, no timer hedge:** the next provider is called only when the current one returns an error (5xx, network, 401/403, `bad_json`), `rate_limited` (429), or is skipped (`circuit_open`, `no_key`, in-flight cap). A slow-but-alive provider is never raced. `LLM_DEADLINE_MS` (450) is **counted from handler entry t0**; on expiry all in-flight calls are aborted and the heuristic answers immediately. A fallback started after an error gets only the remaining budget. `LLM_HEDGE_AFTER_MS` is removed from config and `.env.example`.
Per-provider circuit breaker (`LLM_CIRCUIT_FAILURES`=3, `LLM_CIRCUIT_COOLDOWN_MS`=15000, cooldown ≥ `retry-after`). No key ⇒ provider permanently skipped, WARN once.
401/403 ⇒ provider disabled for the process lifetime, WARN once, `/health.mode` recomputed.
Per-provider in-flight cap `LLM_MAX_INFLIGHT` (16 = keep-alive connections; in `.env.example` since 2026-10-11); at cap the provider is skipped like an open breaker.
Empty `choices` / `finish_reason:"length"` without parsable JSON ⇒ `bad_json` (relevant if reasoning/thinking tokens consume `max_tokens: 90`).
`/health.mode` = `llm:<name>` of the first usable provider, else `heuristic`.
**CP1 measurement items:** (a) the 2-model A/B above; (b) bench reports provider mix, fallback rate, heuristic rate and deadline-timeout rate — with D2, every deadline timeout is a heuristic answer, so that rate is the quality cost of this decision.
Option D1 rejected by the human (H2): simpler chain, no speculative quota use; the N8 analysis showed the hedge window was too short to help anyway.
Option E rejected: under the harness's unknown RPM, doubling calls is the fastest way to be rate-limited into heuristic mode.

## Evidence (accessed 2026-10-11)
| Fact | Source | Status |
|---|---|---|
| Groq OpenAI-compatible base URL `https://api.groq.com/openai/v1`; unsupported fields `logprobs`, `logit_bias`, `top_logprobs`, `messages[].name` → 400; `n` must be 1; `temperature: 0` converted to `1e-8` | https://console.groq.com/docs/openai | verified |
| `llama-3.1-8b-instant` is a **Production** model (131,072 ctx, vendor-stated 560 T/s); `openai/gpt-oss-20b` Production (1000 T/s); `llama-3.3-70b-versatile` Production; preview models "may be discontinued at short notice" | https://console.groq.com/docs/models | verified |
| Groq JSON Object Mode via `response_format:{type:"json_object"}`, listed for "All models"; prompt must include explicit JSON instructions | https://console.groq.com/docs/structured-outputs | verified (8B not named explicitly — "All models") |
| `reasoning_effort` for gpt-oss: `low`/`medium`/`high`; `include_reasoning:false` hides reasoning; whether reasoning counts toward `max_completion_tokens` not stated | https://console.groq.com/docs/reasoning | verified / token accounting **UNVERIFIED** |
| Groq 429 sets `retry-after` (seconds); `x-ratelimit-*` headers always present | https://console.groq.com/docs/rate-limits | verified |
| Groq free-tier limits for `llama-3.1-8b-instant` | same page lists only `openai/gpt-oss-20b` (30 RPM, 1K RPD, 8K TPM, 200K TPD, "base limits for the Developer plan") | **UNVERIFIED** for 8B and for free accounts |
| Gemini OpenAI-compat base URL `https://generativelanguage.googleapis.com/v1beta/openai/` | https://ai.google.dev/gemini-api/docs/openai | verified |
| Gemini compat supports `reasoning_effort` (`minimal`/`low`/`medium`/`high`, `none` only for 2.5 non-Pro); "Reasoning cannot be turned off for … 3 models" | https://ai.google.dev/gemini-api/docs/openai | verified |
| Gemini compat accepts `response_format:{type:"json_object"}` | page documents structured output (schema via `parse`), not `json_object` | **UNVERIFIED** — S3 smoke test decides; parser tolerates fences either way |
| `gemini-3.5-flash-lite` Stable; `gemini-3.8-flash` Stable; 2.5 models "not deprecated" but access limited to prior users; new projects pointed to 3.5 Flash-Lite / 3.8 Flash | https://ai.google.dev/gemini-api/docs/models , https://ai.google.dev/gemini-api/docs/deprecations | verified |
| `gemini-3.5-flash-lite` default thinking "On (minimal)"; `gemini-2.5-flash-lite` default "Off" | https://ai.google.dev/gemini-api/docs/thinking | verified |
| Gemini free-tier RPM/RPD | "can be viewed in Google AI Studio" only | **UNVERIFIED** |
| Actual round-trip latency of either provider for our ~600-token prompt | — | **UNVERIFIED** until `reports/bench-latest.md` (CP1) |
| Cerebras / Ollama OpenAI-compat endpoints (alternatives in `.env.example`) | not checked | **UNVERIFIED** |

## Consequences
- Latency and quality depend on the evaluator's region and key tier; docs must say so (latency-engineering skill).
- If 429s dominate the harness run, results degrade to heuristic: heuristic quality matters more than it looks (S1b/S4).
- Must monitor in bench: provider mix, fallback rate, heuristic rate, 429 count.
- **CP1 rule (3:20):** if Groq p50 ≥ 300 ms or 8B macro-F1 clearly worse than gpt-oss-20b at acceptable latency, switch model in env + amend this ADR with the bench section link.
- `.env.example` updated 2026-10-11 by spec-architect under a one-time human grant: `LLM_FALLBACK_MODEL=gemini-3.5-flash-lite`, `LLM_MAX_INFLIGHT=16` added, `LLM_HEDGE_AFTER_MS` and `CACHE_SIZE` removed.
- With no hedge, a slow-but-alive primary costs quality (heuristic), not latency. Monitor the deadline-timeout rate in bench.
