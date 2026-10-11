# SPEC — Sentiment Intelligence Engine (Track A)
Status: **FROZEN (2026-10-11, by the human via orchestrator)** — r2 after review `.agent-work/reviews/spec-r1.md` + human decisions §11. Author: spec-architect.
Contract changes after freeze require a new ADR in `specs/adr/` plus explicit human approval (CLAUDE.md §2.1).

Authority order: CLAUDE.md > skills (`.claude/skills/*`) for *how* > this SPEC > TASKS.md.
Canonical code for the contract: `packages/contracts/src/telemetry.ts`, `ws.ts` (zod 4). This document explains it; on conflict the code (after freeze) wins and the mismatch is a bug.

---

## 1. Scope & non-goals

**In scope**
- `POST /api/telemetry/stream` (scored by the harness), `GET /health`, `GET /api/telemetry/session/:sessionId/summary`, `WS /ws/telemetry`.
- LLM chain Groq → Gemini → heuristic with hard deadline (ADR-001); deterministic fusion (ADR-003); in-memory sessions (ADR-004).
- One-screen dashboard with the 4 mandatory widgets; basic demo button.
- Eval harness (dataset, confusion matrix, baseline vs reference) and latency bench (p50/p95/p99).

**Non-goals (explicit)**
- Authentication / authorisation, API keys for our own API.
- Persistence / database; sessions die with the process.
- Multi-tenant isolation beyond `session_id` keying; horizontal scaling.
- i18n — English transcripts only; non-English text is accepted but quality is not claimed.
- Audio processing — acoustic metadata is given, never derived.
- Streaming tokens to the client; Docker; extra pages/settings in the UI.

---

## 2. API contract

### 2.1 `POST /api/telemetry/stream` — request
Server parses with the lenient `TelemetryRequestSchema`; clients (demo button, simulate, eval, bench) build payloads typed by the strict `TelemetryRequestWireSchema`. Lenient on everything except the three identity/content fields.

| Field | Type (wire) | Rule | Invalid/missing → |
|---|---|---|---|
| `chunk_id` | string | 1–512 chars, not blank; **not trimmed** (echoed verbatim) | **400** |
| `session_id` | string | 1–512 chars, not blank | **400** |
| `text` | string | any length up to body limit; backend trims, truncates to `MAX_TEXT_CHARS` (2000) before the prompt | non-string/missing → **400**; `""` or whitespace-only → 200 neutral short-circuit (no LLM call; `isBlankText`; policy §6) |
| `timestamp_ms` | number | numeric string accepted; rounded; must be a **safe integer ≥ 0** | anything else (`1e20`, `-5`, `"abc"`, missing) → server time (`Date.now()`), debug log. **Never 400.** |
| `speaker` | `"candidate"` \| `"counterpart"` | case-insensitive | `counterpart`; the backend inspects the **raw body** value (the parsed value can't distinguish) and logs warn once per session |
| `acoustic_metadata` | object, optional, partial | see below | `{}` → all defaults |
| `.pitch_volatility` | float | clamp [0,1] | 0.3 |
| `.speech_rate_wpm` | number | clamp [0,1000] | speaker's running wpm baseline, else 150 |
| `.pause_duration_ms` | number | clamp [0,60000] | 300 |
| `.volume_intensity` | float | clamp [0,1] | 0.5 |

Imputed acoustic fields do **not** update the speaker baseline and contribute z = 0 (`withAcousticDefaults` returns `imputed[]`).
Unknown extra keys are ignored. Body > 32 KB → 413 (Fastify `bodyLimit`). Malformed JSON → 400 `invalid_request`.
zod 4 issue `path` is `PropertyKey[]`; the 400 body joins it with `.` (`acoustic_metadata.pitch_volatility`; root → `""`).

### 2.2 Response — always exactly these 8 keys (`TelemetryResponseSchema` = `z.strictObject`)

| Field | Type | Rule |
|---|---|---|
| `chunk_id` | string | byte-identical echo of the request |
| `processing_latency_ms` | integer ≥ 0 | `Math.round(performance.now() − t0)`, t0 = handler entry, measured just before send |
| `sentiment` | enum | `positive` \| `negative` \| `neutral` \| `sarcastic` \| `aggressive` \| `deflecting` \| `appeasement` |
| `confidence` | float [0,1] | 2 decimals (calibrated, §5.3) |
| `volatility_flag` | boolean | deterministic, §5.1 |
| `hidden_intent` | string 1–60 | `<tactic>_via_<means>` snake_case or `none_detected`; > 60 → word/underscore-boundary truncate |
| `mitigation_suggestion` | string 1–120 | imperative, speaker-aware; > 120 → word-boundary truncate |
| `risk_level` | enum | `low` \| `medium` \| `high` \| `critical` |

**Truncation rule** (`domain/truncate.ts`): if `len ≤ max` return as is; else cut at the last separator (space, or `_` for intents) at index ≤ max; if none in the last 40% of the window, hard-cut at max; strip trailing separators/punctuation fragments. Never append "…". Empty after sanitising → fallback (`none_detected` / heuristic mitigation for the label).

### 2.3 Errors, `/health`, summary, WS
- **400** `{error:"invalid_request", issues:[{path, message}]}` — only for `chunk_id`/`session_id`/`text` problems or malformed JSON. Never echoes `text`.
- **404** (summary) `{error:"session_not_found"}` (status identical to reference; body per api-contract skill).
- **413** body too large. **No 5xx caused by the LLM path, ever.** Any unexpected exception in the service → heuristic result (logged error), not 500.
- `GET /health` → `{status:"ok", mode, version:<package version>, timestamp:<epoch ms>}`; `mode` = `llm:<name>` of the first **usable** provider (has key, not auth-disabled), else `heuristic`. Recomputed when a provider is disabled (§9).
- `GET /api/telemetry/session/:sessionId/summary` → `{session_id, chunk_count, aggregated_volatility_score, dominant_sentiment, top_risk_moments[≤3]}`; each moment `{chunk_id, timestamp_ms, sentiment, risk_level, text_excerpt(≤80, real text)}`. Definitions §5.4.
- `WS /ws/telemetry` server→client only: `{type:"hello", mode}` on connect; `{type:"analysis", session_id, speaker, text_excerpt(≤80), timestamp_ms, result:<Response>}` per chunk. Missing or mismatching `Origin` (vs `CORS_ORIGIN`) → close 1008. Max frame 16 KB.

### 2.4 Reference backend vs. ours (contract oracle diff)

| Aspect | Reference (`docs/assignment/reference-backend/index.js`) | Ours | Why |
|---|---|---|---|
| Endpoints | POST stream, GET summary, GET health | same paths + WS | shape compatibility |
| Stack | CommonJS, Express 4, untyped | ESM, Fastify, TS strict, zod 4 | architecture score |
| Input validation | none; Express 4 `express.json()` gives `{}` on empty body → 200 **without `chunk_id`** (reviewer and spec agree from code reading; CLAUDE.md §2 says 500 — S1b records actual behaviour) | zod; 400 only for id/text; lenient elsewhere | never schema-invalid output |
| Missing acoustics | `?? 0` (silence = calm) | neutral defaults + speaker baseline, imputed flag | 0 wpm is not "calm" |
| Acoustic logic | absolute `pitch > 0.65 \|\| wpm > 190` | per-speaker z-scores, priors for first 2 chunks | 187 wpm differs per person |
| Lexicon | substring `includes("no")` matches "know" | LLM; heuristic uses word-boundary regex | correctness |
| Labels emitted | positive/negative/neutral/aggressive only | all 7 | nuance = 30% |
| Context | none | last 3 turns + prev chunk per speaker | sarcasm needs context |
| volatility_flag | absolute threshold | deterministic `v` formula (§5.1) | explainable, tunable |
| hidden_intent / mitigation | 4 constants per label | LLM, speaker-aware, truncated to 60/120 | actionable |
| processing_latency_ms | `Date.now()` diff inside analyze (≈0) | `performance.now()` handler entry → before send | honest |
| Sessions | unbounded module-level `Map` | `SessionStore` LRU (1000) + TTL (30 min), injected | no leak, no bleed |
| CORS | `cors()` wide open | `CORS_ORIGIN` allow-list | security |
| `/health` | `{status:"ok", mode:"placeholder", version:"1.1.0", timestamp:<ms>}` | same keys; mode `llm:<p>`/`heuristic` | readiness polling |
| Summary 404 body | `{error:"Session not found"}` | `{error:"session_not_found"}` | api-contract skill; status identical |
| Summary `aggregated_volatility_score` | fraction of flagged chunks, 2dp | **same** (mean `v` only in eval reports) | harness may compare values |
| Summary `top_risk_moments` | high/critical only, sorted by risk; `text_excerpt` = hidden_intent | high/critical only, risk desc **then most recent first**; real ≤80-char excerpt | same membership; CLAUDE.md §2 excerpt |
| Summary `dominant_sentiment` ties | insertion order | taxonomy tie-break order | deterministic |
| Summary aggregates source | full in-memory list | running counters (not the capped record list) | correct after record cap |

---

## 3. Label decision rules
**Canonical source: [`.claude/skills/nuance-taxonomy/SKILL.md`](../.claude/skills/nuance-taxonomy/SKILL.md)** §1 (labels, NOT-when, tie-break, context rule), §3 (hidden_intent format), §4 (mitigation format), §5 (risk rubric). Not copied here on purpose — the prompt (`llm/prompt.ts`), the eval labels and this spec all point to that file. Proposed amendments: `.agent-work/requests/skill-nuance-taxonomy.md`.

Spec-level additions that do not contradict the skill:
- No classification rule may be derived from the single example in the brief; the eval dataset must contain the brief's sentence pattern labelled **several different ways** under different contexts/acoustics (context-flip and counterfactual pairs).
- Heuristic classifier confidence ≤ 0.6 (llm-provider-integration skill).

---

## 4. Acoustic features & per-speaker baseline
- Baseline key `session_id × speaker`; Welford running mean/variance per field over **observed** values only.
- Population priors (ours, untested, tunable; used while a speaker has < 2 observed values for that field):

| Field | prior mean | prior std |
|---|---|---|
| pitch_volatility | 0.35 | 0.20 |
| speech_rate_wpm | 150 | 30 |
| pause_duration_ms | 400 | 300 |
| volume_intensity | 0.50 | 0.15 |

- `z = (x − mean) / max(std, 0.5·prior_std)`; clamp z to [−4, 4].
- Prompt descriptors (no raw numbers to the LLM except pause): |z| < 1 "normal"; 1 ≤ |z| < 2 "higher/lower"; ≥ 2 "much higher/much lower". Pause "long (1.2s)" when z ≥ 1.5 or > 800 ms.
- `arousal_z = mean(z_pitch, z_rate, z_volume)` (imputed → 0). Pause is a hesitation cue for the LLM, not arousal.
- Acoustics never decide sentiment alone (skill §2); the heuristic uses them only to break ties and adjust confidence.

## 5. Fusion: volatility, confidence, risk, summary aggregates (deterministic — ADR-003)
Order of evaluation in `domain/fusion.ts`: **5.1 volatility → 5.2 confidence calibration → 5.3 risk** (risk uses the calibrated confidence).

### 5.1 Volatility
`v = clamp01( 0.4·min(1, |Δarousal_z| / 2) + 0.4·valence_shift + 0.2·pitch_volatility )`
- Δ and valence shift vs the **same speaker's** previous committed chunk (snapshot at arrival); none ⇒ those terms 0.
- Valence scale: positive 1 · appeasement .6 · neutral .5 · deflecting .4 · negative .3 · sarcastic .2 · aggressive 0.
- `volatility_flag = v ≥ VOLATILITY_THRESHOLD` (env, default 0.6). `v` (2dp) is kept per chunk for eval/debug.
- Worked check (not a test oracle): previous positive → current aggressive (valence 1.0 → 0.4), Δz = 1.5 (→ 0.3), pitch 0.8 (→ 0.16): v = 0.86 ⇒ flag. Same text, calm delivery, previous negative: 0.4·0 + 0.4·0.3 + 0.2·0.2 = 0.16 ⇒ no flag.

### 5.2 Confidence
LLM `c` clamped [0,1]; heuristic ≤ 0.6; delivery/text contradiction (|arousal_z| ≥ 1.5 with positive/neutral label) ⇒ ×0.85; round 2dp last.

### 5.3 Risk
Base = LLM `r` (or heuristic). Then in order: (1) aggressive ⇒ ≥ high; (2) aggressive ∧ volatility_flag ⇒ critical; (3) positive ∧ **calibrated** confidence ≥ 0.8 ⇒ ≤ medium. Missing `r` ⇒ sentiment default (ADR-003 §4).

### 5.4 Summary aggregates (running counters per session, updated on commit)
- `chunk_count` = number of unique committed `chunk_id`s (duplicates ignored, §6).
- `aggregated_volatility_score` = `flagged_count / chunk_count`, 2dp (same definition as reference).
- `dominant_sentiment` = mode of a per-label counter; ties by taxonomy tie-break order.
- `top_risk_moments` = only `high`/`critical` chunks, sorted risk desc → `timestamp_ms` desc (most recent first); top 3; may be `[]`. Maintained as a bounded top-3 list on commit (independent of the 200-record cap). `text_excerpt` = trimmed text, word-boundary truncated to 80.

## 6. Context window & session state (ADR-004)
- K = `CONTEXT_TURNS` (3) most recent turns of the session (both speakers), each ≤ 40 words, with their label: `[speaker|sentiment] text`.
- Snapshot at arrival, lock-free; **commit synchronously in the same tick as `reply.send()`** (immediately after it, no `await` between); insert ordered by `timestamp_ms`; WS broadcast after commit.
- Duplicate `chunk_id` in a session (tracked in a per-session Set, FIFO-capped at 5000) → re-analysed and returned, not committed again.
- `MAX_SESSIONS` 1000 (LRU), `SESSION_TTL_MS` 30 min idle; ≤ 200 context/history records per session; counters (§5.4) are not capped. An evicted/expired session's summary → 404.
- **Empty-text chunks** (`""` **and whitespace-only**, `isBlankText`): returned neutral; committed to counters (they count in `chunk_count`); not added to context turns; no baseline update.
- **No verdict cache.** The cache (former S7b, pipeline step 4 in CLAUDE.md §3) was **cut by the human at freeze (H1, 2026-10-11)**: a context-safe key only hits on byte-identical replays, which the scored run is unlikely to contain. Pipeline is validate → snapshot → acoustic features → classify → fuse → truncate/parse → send → commit. Recorded in ADR-004.

## 7. Provider strategy, deadline, fallback, circuit breaker
See **ADR-001**. Summary: one OpenAI-compatible adapter; Groq `llama-3.1-8b-instant` primary; Gemini `gemini-3.5-flash-lite` fallback; **sequential fallback, no timer hedge** (human decision H2): the next provider is tried only when the current one returns an error (`http`/network/401/403/5xx, `bad_json`), `rate_limited` (429), or is skipped (`circuit_open`, `no_key`, in-flight cap). A slow-but-alive provider is **not** raced: if `LLM_DEADLINE_MS` (450) **counted from t0 (handler entry)** expires, all in-flight calls are aborted and the heuristic answers immediately. A fallback started late only gets the remaining budget (`deadline − elapsed`). Breaker 3 failures / 15 s (timeouts count as failures); per-provider in-flight cap `LLM_MAX_INFLIGHT` (16, = keep-alive connections); compact JSON `{"s","c","i","m","r"}` (+ optional `"sh"`, ignored by fusion), `max_tokens` 90, temperature 0; static system prefix first; transcript wrapped in `<<< >>>` as data. Warm-up request per provider on boot (non-blocking).
**CP1 items:** (a) 2-model A/B `llama-3.1-8b-instant` vs `openai/gpt-oss-20b` on the tune split — macro-F1, nuance subset, p50/p95, `finish_reason:length` count — run regardless of scores (TASKS S3c); winner set via `LLM_PRIMARY_MODEL`, ADR-001 amended with the report link. (b) Bench reports the fallback/heuristic rate; with no hedge, a slow Groq goes straight to heuristic at the deadline.

## 8. Latency budget (p50, end-to-end at the client; latency-engineering skill)

| Stage | Budget (ms) |
|---|---|
| HTTP parse + zod validate | 1 |
| session snapshot + acoustic features | 1 |
| prompt build | < 1 |
| LLM round trip (Groq, keep-alive, warm) | ≤ 200 |
| parse + fuse + truncate + `ResponseSchema.parse` + serialize | 2 |
| network / loopback slack | ~40 |
| **Total** | **≤ 245** |

(No cache stage — cut, §6.) p95 < 500 is bounded structurally: deadline 450 from t0 + ~5 ms local work; with no timer hedge, a slow primary yields a heuristic answer at ~450 ms rather than a fallback-LLM answer. Off the hot path: WS broadcast, metrics (commit is a same-tick synchronous step after send).
Gate: `scripts/gate.mjs` runs `bench --quick` and reads its metrics comment from **`reports/bench-quick.md`**. That file is transient and git-ignored, and is deleted before each run; the gate fails if it is missing, has no metrics, or shows p50 > 250 or p95 > 500. Docs (ARCHITECTURE.md, README) cite only the committed full-bench report **`reports/bench-latest.md`**, never `bench-quick.md` (T12, 2026-10-11).

## 9. Failure modes

| Trigger | Behaviour | Status | Test name (vitest unless noted) |
|---|---|---|---|
| No API keys at all | Server starts, WARN once, `/health.mode="heuristic"`, heuristic results | 200 | `boot.no-keys.serves-heuristic` |
| Only one key | Missing provider skipped (`no_key`); its errors go straight to heuristic | 200 | `chain.single-provider` |
| Primary 401/403 (bad/revoked key) | Provider disabled for process lifetime, WARN once (no key in log), `/health.mode` recomputed; reason `http`; fallback tried | 200 | `chain.auth-error-disables-provider` |
| Primary 429 | Breaker counts failure; fallback tried with the remaining budget; cooldown ≥ `retry-after` | 200 | `chain.429-falls-back` |
| Network error / 5xx | Reason `http`; fallback tried; breaker counts | 200 | `adapter.network-error-is-http`, `chain.error-falls-back` |
| Primary circuit open / at in-flight cap | Skipped instantly; fallback tried | 200 | `chain.circuit-open-skips`, `chain.inflight-cap-skips` |
| All providers failing / open / capped | Heuristic instantly (no deadline wait) | 200 | `chain.all-open-instant-heuristic` |
| Primary slow (alive, no error) | **No hedge**: keep waiting until the deadline; fallback is NOT started | 200 | `chain.slow-primary-no-hedge` |
| Deadline (from t0) exceeded | Abort all in-flight → heuristic immediately; breaker counts a timeout; `processing_latency_ms` ≈ deadline | 200 | `chain.deadline-heuristic` |
| Malformed / fenced / partial JSON | `parse.ts` strip fences → first `{…}` → zod; fail ⇒ `bad_json` (an error) ⇒ next provider | 200 | `parse.*`, `chain.bad-json-next` |
| Empty `choices`, null content, or `finish_reason:"length"` with unparsable content (reasoning/thinking tokens ate `max_tokens`) | `bad_json` ⇒ next provider; counted separately in bench | 200 | `parse.empty-choices`, `parse.length-truncated` |
| Invalid enum / casing / out-of-range `c` | lowercase, map synonyms, clamp; unknown sentiment ⇒ `bad_json` | 200 | `parse.coerces-enums` |
| Intent > 60 / mitigation > 120 | Word-boundary truncate | 200 | `contract.truncates-61-121` |
| Provider rejects `response_format` (400) | Retry once without it; log once | 200 | `adapter.json-mode-unsupported` |
| Missing `chunk_id`/`session_id`/`text`, wrong type | `invalid_request` with joined paths, no text echo | 400 | `contract.missing-text-400` |
| Malformed JSON body / empty body | `invalid_request` | 400 | `contract.malformed-body-400` |
| `timestamp_ms` = `1e20`, `-5`, `"abc"`, missing | Server time used | 200 | `contract.bad-timestamp-200` |
| Missing keys under zod 4 (no `speaker`, no `timestamp_ms`, no `acoustic_metadata`) | `counterpart` / server time / `{}` | 200 | `contract.zod4-missing-keys-200` |
| Missing/partial/garbage `acoustic_metadata` | Defaults + clamp | 200 | `contract.missing-acoustics-200` |
| Unknown speaker value | `counterpart` + warn (raw body inspected) | 200 | `contract.unknown-speaker` |
| Empty `""` or whitespace-only `text` (`"   "`, `"\n\t"`) | Neutral short-circuit, no LLM; counters only (§6) | 200 | `pipeline.empty-text-neutral`, `pipeline.whitespace-text-neutral` |
| `chunk_id`/`session_id` length 512 / 513 | 200 / 400 | 200/400 | `contract.id-length-512` |
| Out-of-order chunks | Accepted; analysed with arrival snapshot; committed in timestamp order | 200 | `session.out-of-order-commit` |
| Duplicate chunk_id | Re-analysed; not double-committed | 200 | `session.duplicate-idempotent` |
| Concurrent sessions | No context/baseline/counter bleed; `chunk_id` echo correct | 200 | `session.concurrency-no-bleed` (20 × 10) |
| Unknown session (stream) | New session created | 200 | `session.auto-create` |
| Unknown / evicted session (summary) | `session_not_found` | 404 | `summary.unknown-404` |
| Client disconnects mid-request | Pipeline completes (LLM not aborted — result still useful for session state); commit happens; send is a no-op; logged at debug | — | `pipeline.client-abort-still-commits` |
| Huge text (≤ 32 KB body) | Trim + truncate to `MAX_TEXT_CHARS` before prompt; context turns ≤ 40 words | 200 | `pipeline.huge-text-truncated` |
| Body > 32 KB | Fastify rejects | 413 | `contract.body-too-large-413` |
| Prompt injection in text | Wrapped as data; output still schema-validated; label not forced | 200 | eval injection chunks (S2a) + `parse.ignores-extra-keys` |
| Unexpected exception in service | Logged error, heuristic result | 200 | `pipeline.exception-falls-back` |
| Session memory pressure | LRU evicts oldest session; TTL sweeps idle | — | `session.lru-evicts` |
| WS bad or **missing** `Origin` | Close 1008 | — | `ws.origin-rejected`, `ws.origin-missing-rejected` |
| WS client slow | Dropped when buffered > 1 MB | — | `ws.slow-client-dropped` |

## 10. UI requirements (canonical: `copilot-dashboard-ux` skill)
Single screen at 1280×800 without scrolling: **Mitigation panel** (largest), **Traffic light** (low/medium/high/critical with colour + icon + text), **Volatility alert** banner (role=alert, decays 8 s), **Sentiment stream** (newest top: time · You/Them · chip · confidence · intent · ms). Header: current session id (most recent session; no selector — cut with S9), connection state, rolling p50 from `processing_latency_ms`, `/health.mode`.
Data: POST responses from the demo button + WS frames into one store, dedupe by `chunk_id`, zod-validated. Works against the reference backend (`VITE_API_TARGET`) with WS absent.
**Basic demo button (in S6c):** one "Play demo" button POSTs a short scripted negotiation at real cadence. S9 (demo player polish, keyboard shortcuts, session selector, narrow layout) was **cut by the human at freeze**. No charts, modals, or settings.

## 11. Open questions & human decisions

### 11.1 Open questions
**None open at freeze.** All closed by the human on 2026-10-11 (decision log below).

| # | Question | Decision (human, 2026-10-11) |
|---|---|---|
| Q1 | Fallback model in `.env.example` | **`gemini-3.5-flash-lite`** (ID verified by the human); `.env.example` updated. |
| Q2 | Primary model | 2-model A/B `llama-3.1-8b-instant` vs `openai/gpt-oss-20b` at CP1 **regardless of scores** (TASKS S3c). |
| Q3 | Empty / whitespace-only `text` | **200 neutral** short-circuit, no LLM call. |
| Q4 | `timestamp_ms` in WS `analysis` frames | **Yes.** |
| Q5 | Dataset size | **≥ 80 chunks / ≥ 10 sessions.** |
| Q6 | Volatility normalisation `/2` + same-speaker reading | **Yes**; unit tests for both worked examples (0.86, 0.16) in S5b. |
| Q7 | id length limit | **512 chars** (not 128/256). |
| Q8 | Cache key | Accepted but **moot** — cache cut (H1). |

### 11.2 Time-box decisions (human, 2026-10-11)

| # | Decision | Applied in |
|---|---|---|
| H1 | **Cut S7b (verdict cache) entirely**; `CACHE_SIZE` removed | SPEC §6/§8, ADR-004, TASKS, `.env.example` |
| H2 | **Override:** fallback only on error / 429 / circuit-open; **no timer hedge**; deadline (from t0) → heuristic; `LLM_HEDGE_AFTER_MS` removed | SPEC §7/§9, ADR-001, TASKS S4a, `.env.example` |
| H3 | **Paired reviews** S1a+S1b, S3a+S3b, S5a+S5b | TASKS |
| H4 | **S10 is the second cut**, kept until CP2 | TASKS |
| H5 | **Cut S9 polish now**; a basic demo button stays in S6 (S6c) | SPEC §10, TASKS |
| H6 | S0 eval/bench/simulate scripts print "not implemented", no files under `apps/backend/eval` (review B4c) | TASKS S0 |

## 12. Riskiest assumptions (ranked)
1. **The evaluator's keys/tier sustain the harness's request rate.** Free-tier RPM for `llama-3.1-8b-instant` and Gemini are UNVERIFIED. If wrong, most chunks go heuristic and nuance score collapses. *Mitigation:* breaker + instant heuristic, in-flight cap, strong heuristic; bench reports 429/heuristic rates.
2. **An 8B model can separate sarcastic/deflecting/appeasement well enough.** UNVERIFIED until S2/S3 eval. *Mitigation:* contrastive few-shots, context turns, CP1 A/B with gpt-oss-20b.
3. **Groq round trip ≤ 200 ms p50 from the evaluator's region.** Vendor throughput numbers ≠ our TTFT. *Mitigation:* keep-alive, warm-up, ~600 input tokens, 90 output; deadline bounds p95.
4. **The backend lane fits 9 h.** Implementation 255 min + ~65 min paired review/gate ≈ 320 min vs ~350 min effective window (91%). *Mitigation:* S10 is the next cut at CP2, then PLAYBOOK order.
5. **Our self-authored labels match the hiring team's labelling.** *Mitigation:* follow taxonomy strictly, `acceptable_sentiments`, double-label a 20-chunk subset, report lenient accuracy.
6. **The harness sends one session's chunks sequentially, in order.** If not, context is weaker (ADR-004). *Mitigation:* snapshot design stays correct, just less informed.
7. **Gemini compat accepts `json_object` and fits a 90-token budget with minimal thinking.** UNVERIFIED; *mitigation:* retry-without, tolerant parser, `finish_reason:length` failure mode, CP1 measurement.

## 13. Self-critique — 5 weakest points of this spec (frozen version)
1. **Volatility weights, threshold and priors are invented.** Nothing measured supports 0.4/0.4/0.2, 0.6, or the prior table. *Mitigation:* constants in one module; eval S8 reports volatility P/R/F1; changes recorded in ADR-003; dataset must include multi-turn shifts.
2. **Volatility cannot fire on a speaker's first chunk** (only the 0.2 pitch term), and the summary score is now the coarse flagged fraction, so a session that opens with an outburst under-reports. *Mitigation:* accepted trade-off (a "shift" needs a before); Q6 + skill request; mean `v` still reported in eval.
3. **Latency budget assumes a warm, nearby Groq, and with no timer hedge a slow-but-alive Groq means heuristic quality for that chunk.** Every chunk where Groq takes > ~450 ms gets the weakest classifier. *Mitigation:* CP1 A/B + bench report heuristic rate; if it's material, lowering `LLM_DEADLINE_MS` doesn't help quality — only a faster model/provider does, and that's the CP1 switch decision.
4. **The backend plan is still ~91% of an effective window that already borrows the buffer.** *Mitigation:* S10 is pre-agreed as the next cut at CP2; eval/frontend lanes have slack but cannot absorb backend work (lane rules).
5. **The heuristic is the real product under rate limiting, yet it gets the least time** (S1b 20 min + S4b 15 min). *Mitigation:* eval reports per-provider accuracy so weakness is visible; S4b fixes the top failure cluster from the baseline; no-key mode is what an evaluator without keys sees first.
