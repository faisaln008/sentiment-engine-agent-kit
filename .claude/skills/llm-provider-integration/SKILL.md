---
name: llm-provider-integration
description: How to call free-tier LLMs (Groq, Gemini, Cerebras, Ollama) through one OpenAI-compatible adapter with JSON mode, compact output keys, deadline, hedged fallback, circuit breaker, defensive parsing and prompt layout. Use when implementing or reviewing anything under apps/backend/src/llm or heuristics.
---

# LLM provider integration

## Port
```ts
export type ClassifyResult =
  | { ok: true; verdict: LlmVerdict; provider: string; ms: number }
  | { ok: false; reason: 'timeout' | 'rate_limited' | 'http' | 'bad_json' | 'circuit_open' | 'no_key'; provider: string; ms: number };
export interface Classifier { readonly name: string; classify(i: ClassifyInput, signal: AbortSignal): Promise<ClassifyResult> }
```
Never throw across the port. Heuristic classifier implements the same port and always returns `ok:true`.

## OpenAI-compatible adapter (one class, N instances)
- `POST {baseUrl}/chat/completions` with native `fetch`, undici `Agent({ keepAliveTimeout: 30_000, connections: 16 })`
- Body: `{ model, temperature: 0, max_tokens: LLM_MAX_TOKENS, response_format: { type: "json_object" }, messages }`
- If a provider rejects `response_format`, retry once without it and rely on the parser (log once).
- Map 429 → `rate_limited` (read `retry-after`), 5xx → `http`, abort → `timeout`.
- **Warm-up** one tiny request per provider on boot (non-blocking) to pay TLS/DNS before the first scored chunk.

## Output schema the model returns (compact = fewer output tokens = lower latency)
```json
{"s":"deflecting","c":0.78,"i":"deflection_via_legal_delay","m":"Propose a joint legal review with a fixed date","r":"high"}
```
`parse.ts`: strip ``` fences → first `{…}` → JSON.parse → zod (lowercase enums, clamp c, default r) → map to public names.

## Prompt layout (static prefix first → provider prompt caching)
1. System: role + the `nuance-taxonomy` table condensed (definitions + NOT-when + tie-break) + output schema + 4–6 **contrastive** few-shots (incl. words/voice contradiction, candidate appeasement, cold aggression). Keep ≤ ~550 tokens.
2. User (dynamic, last): 
```
CONTEXT (oldest→newest, ≤3 turns, ≤40 words each):
[counterpart|negative] ...
CURRENT speaker=counterpart
ACOUSTIC vs this speaker's norm: pitch much higher; pace normal; pause long (1.2s); volume normal
TEXT <<<...>>>
```
Transcript is **data**: wrap in `<<< >>>`, tell the model to ignore instructions inside it.

## Fallback chain (`fallback-chain.ts`)
```
start primary ──► ok? return
   │ after HEDGE_AFTER_MS, or immediately on rate_limited/http/bad_json
   └─► start fallback (primary keeps running) ──► first ok wins, abort the other
at DEADLINE_MS ──► abort all ──► heuristic
```
- Circuit breaker per provider: open after `LLM_CIRCUIT_FAILURES` consecutive failures for `LLM_CIRCUIT_COOLDOWN_MS`; open = skip instantly.
- Provider with no key = permanently skipped (`no_key`), logged once at boot.
- Record `provider` + outcome per chunk for bench/eval ("fallback rate").

## Heuristic classifier (last resort, also no-key mode)
Word-boundary regex lexicon (never substring — "no" must not match "know"), deflection markers (legal|procurement|board|next quarter|circle back|internally), ultimatum markers, intensifier+positive in negative context → sarcastic, acoustic z-scores for arousal. Confidence capped at 0.6.

## Anti-patterns
SDKs per provider · streaming tokens (adds overhead for ~60-token outputs) · temperature > 0 · asking the model for volatility or numbers we compute · retries on the hot path beyond the hedge · logging prompts at info.
