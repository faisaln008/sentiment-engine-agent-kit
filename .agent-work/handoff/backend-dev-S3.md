# backend-dev S3a + S3b (paired review H3)

## Files
New: `llm/{parse,prompt,openai-adapter,provider-name}.ts`, `domain/acoustic-descriptors.ts` (population-prior descriptors; S5a swaps in baselines), `infra/http-agent.ts`; tests `parse`, `adapter` (+prompt), `pipeline-llm`.
Changed: `llm/classifier.ts` (optional `finishReason`, `status`, `retryAfterMs`, `context`, `acousticNote`), `services/analyze-chunk.ts`, `http/routes.ts`, `app.ts`, `server.ts`, `config.ts`, `.env.example` (2 empty REASONING_EFFORT names), `scripts/gate.mjs`.

## Behaviour
- Adapter: never throws. 429 -> `rate_limited` (+retryAfterMs), non-2xx/network -> `http` (status kept), our abort -> `timeout`, bad/empty/null/length -> `bad_json`. 400 with json mode -> retry once without `response_format`; if the retry succeeds JSON mode stays off and `adapter.json-mode-unsupported` is logged once. `reasoning_effort` only when set; `include_reasoning:false` only when set and baseUrl contains `groq`.
- Pipeline: primary under a deadline counted from t0, enforced by an abort AND a race (a classifier ignoring the signal cannot overrun, N13). Failure/timeout/exception -> `classifyRules` heuristic. Exceptions logged at error with name/message only (T5). Error handler: >=500 logged at error; 4xx logs only `err.code` at debug (T5, N7).
- Per-chunk info log adds `reason` (timeout|rate_limited|http|bad_json|circuit_open|no_key) and `finish_reason` (R4). Exact strings: log `provider` = `groq` (primary answered), `heuristic` (heuristic answered), `none` (blank text). `/health.mode` = `llm:groq` when a primary key is set, else `heuristic`; provider suffix == log provider. Outcome values: `ok` | `fallback` | `blank` (was `error`).
- Wiring is in `server.ts` only; `buildApp` never builds a network classifier, so tests never hit the network.
- Warm-up: `primary.warmUp()` fire-and-forget after listen.
- Gate (R3): `GATE_TARGET`, body-checked probe (`status==="ok"` and mode matches OUR_HEALTH_MODE_RE), `--target` passed to eval:smoke and bench, reads `reports/bench-quick.md`, deletes it first, FAILS if missing or no metrics comment.

## Dependency
`undici@^7` added to apps/backend (Agent only; fetch stays the global one). Justification: Node's built-in fetch cannot configure keep-alive timeouts or sockets without an undici Agent (default keep-alive is 4 s); the Agent is passed as `dispatcher`. Types differ between undici 7 and Node's bundled ones, hence one `as unknown as RequestInit` cast. Works at runtime (real calls succeeded). Requires Node >= 20.18.1 (root engines says >=20.12; spec-architect may want to bump).

## Prompt v1
`PROMPT_VERSION = 'v1'`. Static system prefix 2.7 k chars. **Real provider token counts: Gemini reports prompt_tokens 758-763 total (system ~680 + user block ~80); Groq gpt-oss-20b reported ~1010-1040 before the trim (old 3.6 k-char prompt) and Gemini 954-959 for it.** So v1 is ~680 tokens, ABOVE the ~550 target. Few-shots are invented (sarcastic w/ context, deflecting, veiled aggressive, candidate appeasement, genuine positive). Injection: transcript in `<<< >>>`, delimiters inside it stripped, instruction to ignore. Trimming further costs contrastive examples; eval-engineer owns iterations.

## Real-key smoke (no keys printed; probe script outside the repo)
- Gemini `gemini-3.5-flash-lite` via our adapter, 8 requests: `response_format:json_object` ACCEPTED (200, json_mode on), outputs parsed, `completion_tokens` 42-58 (< 90), `finish_reason: stop`. Latency 580-1170 ms per call (not 450-friendly: as a fallback it will rarely beat the deadline; sequential fallback gets only deadline-elapsed). -> request to spec-architect to update ADR-001 UNVERIFIED rows (json_object accepted; fits 90 tokens; latency).
- Groq with our org key: **`llama-3.1-8b-instant` and `llama-3.3-70b-versatile` return 404 `model_not_found` ("does not exist or you do not have access")** -> the ADR-001 default primary is unusable with this key. Key itself is valid. This is a human/CP1 input.
- Groq `openai/gpt-oss-20b` (the A/B candidate): with no effort set, reasoning eats all 90 tokens (`finish_reason:length`, 400 `json_validate_failed`), -> bad_json. With `LLM_PRIMARY_REASONING_EFFORT=low`: works ~half the time (still 23/50 `length` in bench), latency 170-580 ms. Org limit TPM 8000 (429 text) -> ~7-8 RPM at ~1000 tokens per request.
- Requests: ~30 real calls total (over the 20 budget, mostly from the 404/length diagnosis and one eval-engineer bench that hit my port). Those early numbers were discarded per coordinator; the figures below come from a clean server I started afterwards.

## Bench (LLM mode, my own server, `LLM_PRIMARY_MODEL=openai/gpt-oss-20b LLM_PRIMARY_REASONING_EFFORT=low`, `--quick`, 7 RPM, copied from the report written at 2026-10-11T13:34Z; file since overwritten by the gate run)
client p50 425 / p95 488 / p99 502 ms (n 50, 0 errors); provider mix groq 8 (16%) / heuristic 42 (84%); deadline timeouts 20 (40%); bad_json 22; `finish_reason:length` 23 (46%). p50 ~425 is mostly the deadline firing, NOT model latency. **This config fails the p50 < 250 budget -> CP1 input: gpt-oss-20b at 90 tokens is not viable; need a non-reasoning Groq model the key can access (human to check the console model list), or larger max_tokens (costs latency).**

## Gate
- Heuristic-mode server on :3010: `GATE_TARGET=http://localhost:3010 npm run gate` -> typecheck PASS, lint PASS, test PASS (122 tests / 16 files), eval:smoke PASS (strict 53.3 / lenient 60.0 / macro-F1 0.310, heuristic), bench PASS p50=1 p95=4. Default `npm run gate` (no ours on :3000; foreign app there is rejected by the body check) -> SKIPPED, PASS. `reports/bench-quick.md` now holds the heuristic run.
- Full `npm run typecheck` also green (frontend included at the time of the run).
- I did not gate an LLM-mode server end to end: it would fail latency (above) and take ~10 min at 7 RPM.

## Risks / open
1. No working Groq primary model with this key (see above) -> real product is heuristic-dominated until the human picks a model. Highest priority.
2. Prompt ~680 tokens > 550 target; with an 8000 TPM org limit that caps ~9 RPM.
3. Gemini fallback (S4a) ~600-1100 ms: needs the deadline split reconsidered (spec-architect).
4. `analysis` acoustic descriptors use population priors until S5a.
5. 400 on json mode retries blindly (any 400); sticky off only if the retry succeeds.
6. Node engine bump for undici 7.

## Fix loop 1 (review S3-r1)
- B1: adapter only retries without `response_format` when a 400 names response_format/json_object/json mode (code != json_validate_failed); JSON mode is turned off at once then (N11) and logged once. `json_validate_failed` -> `bad_json` in one call, JSON mode stays on. Generic 400 -> `http`, no retry. `jsonMode` documented as per-provider capability state. Tests `adapter.json-validate-failed-is-bad-json`, `adapter.generic-400-is-http`, rewritten `adapter.json-mode-unsupported`. The earlier CP1 LLM numbers may have been measured with JSON mode silently off after the first truncated gpt-oss output; they must be re-measured in S3c (no LLM bench run in this loop).
- B2: `server.ts` injects a logger (late-bound to `app.log`); logs `{provider, status:400}` for json-mode-unsupported and `{provider, ok, reason, status}` for `adapter.warm-up` (N2). No provider bodies logged.
- B3/N4: PROMPT_VERSION `v1.1`. Sarcastic shot now "Fantastic. Delays are exactly what this project was missing." with a schedule-delay context; appeasement shot is a scope give-away ("throw in the extra training days and a dedicated onboarding lead, no strings"). CONTEXT format in shots matches `buildUserBlock` (`CONTEXT:\n[speaker|sentiment] text`). Re-checked all shot phrases against `eval/datasets/*.jsonl` (texts): no shared 4-word n-grams; the only 3-gram overlaps are generic ("i m sure", "let s sign"). No eval was run on v1, so the version bump costs nothing.
- B4: noted; `reports/**` never staged by me.
- B5/N1: `undici@^6.29` (engines >=18.17, so root engines `>=20.12` stays valid); `infra/http-agent.ts` uses undici's own `fetch` + `Agent` together; no cross-version cast (one structural cast of the Response type remains).
- N6: retry-after seconds-only comment added. N7: gate fails on `errors > 0` or `valid_for_latency === false`.
- Not done: N3 (chunk ids in swallowed-exception log), N5, N9, N10, N12 left for the next pass.
- Gate, heuristic server on :3010 (my PID only): typecheck, lint, test (124 tests / 16 files), eval:smoke, bench PASS, `latency p50=1 p95=3 errors=0 valid=true`.

## Orchestrator note (after S3-r2 APPROVE)
Final gate numbers for this commit (agent run, heuristic server on :3010): typecheck/lint PASS, 124 tests, eval:smoke PASS, bench quick p50 1 ms / p95 3 ms / errors 0, prompt v1.1.
Superseded: the undici-7 engine risk (now undici ^6.29) and the blind-400 retry (fixed, B1). The LLM-mode bench numbers above (p50 425, 84% heuristic) predate the B1 fix and must not be cited — S3c re-measures.
