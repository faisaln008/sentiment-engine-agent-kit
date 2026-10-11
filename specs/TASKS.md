# TASKS — vertical slices S0–S10
Status: **FROZEN 2026-10-11** with SPEC.md (human decisions SPEC §11 applied). Sized to `docs/PLAYBOOK.md` §3 (9 h). Every task ≤ 60 min.
Estimates = agent implementation + narrowest verification. Review/gate time is listed separately.
Every slice also implies the CLAUDE.md §8 DoD: `npm run gate` green, reviewer APPROVE, handoff file, ai-log updated if needed.

## Capacity check

| Lane | Window (PLAYBOOK) | Available | Implementation | + review/gate | Utilisation |
|---|---|---|---|---|---|
| backend-dev | 0:40–1:50, 1:50–3:20, 3:20–4:20, 5:00–5:50 (+ 4:20–5:00 and 8:20–9:00 if borrowed) | 270 (350 effective) | **255 min** | 8 reviews (3 paired) ≈ 65 → **≈ 320** | 119% nominal / **91% effective** |
| eval-engineer | 0:40–3:20 (S2 may spill past 1:50), 4:20–5:00, 5:50–6:30 | 240 | **185 min** | — | 77% |
| frontend-dev | 0:40–4:20, 5:00–5:50 | 270 | **135 min** | — | 50% |
| **Total slice effort** | | | **575 min** | | |

Non-slice phases (not counted): kickoff 40 · audit 40 · ship 60 · buffer 40.

**Human decisions applied (2026-10-11):** S7b cache **cut** (H1) · no timer hedge — fallback only on error/429/circuit-open, deadline → heuristic (H2) · **paired reviews** S1a+S1b, S3a+S3b, S5a+S5b (H3) · S10 is the **second cut**, kept until CP2 (H4) · S9 polish **cut**, basic demo button in S6c (H5) · CP1 model A/B mandatory (S3c).
**Cut order if late:** S10 (at CP2) → S4b heuristic hardening (keep exception safety) → WS (S7a/S6c; POST-driven demo still satisfies "live results"). Never cut: S2 eval report, heuristic fallback, four widgets, demo button, docs.

**Review pairing (H3):** one reviewer pass each for {S1a+S1b}, {S3a+S3b}, {S5a+S5b}; singles for S0, S4a, S4b, S7a, S10. The first slice of a pair hands off without review; the second hands off both with one gate run.

---

## S0 — Monorepo scaffold · backend-dev · 20 min · deps: FREEZE · review: single
- [x] npm workspaces `packages/*`, `apps/*`; TS `strict`, `noUncheckedIndexedAccess`, `exactOptionalPropertyTypes`; ESM; Node ≥ 20.10
- [x] `packages/contracts` (package.json + tsconfig written by spec-architect) builds with `tsc -b` **unchanged**; any type error there → `.agent-work/requests/contract-change-<n>.md`, do not edit
- [x] Root `typecheck` script covers `packages/contracts` + `apps/backend` only; **`apps/frontend` excluded** until S6a adds it back
- [x] eslint (flat) + prettier; vitest at root; `apps/backend` Fastify skeleton compiles and references contracts
- [x] All CLAUDE.md §5 scripts exist; `eval`, `eval:smoke`, `bench`, `simulate` print `not implemented (S2)` and exit 0 — **no files created under `apps/backend/eval/**`**
- [x] `config.ts` reads exactly the vars in `.env.example` (already updated: `LLM_FALLBACK_MODEL=gemini-3.5-flash-lite`, `LLM_MAX_INFLIGHT`, no `LLM_HEDGE_AFTER_MS`, no `CACHE_SIZE`)
- [x] `npm run gate` runs end-to-end green (eval/bench SKIPPED is OK)

## S1a — Stream endpoint skeleton + health · backend-dev · 25 min · deps: S0 · review: paired with S1b
- [x] `config.ts` parses env with zod; missing keys ⇒ WARN once, never crash
- [x] `POST /api/telemetry/stream`: `TelemetryRequestSchema` → service → `TelemetryResponseSchema.parse` → send; bodyLimit 32 KB
- [x] 400 `{error:"invalid_request", issues}` for missing/invalid `chunk_id`/`session_id`/`text` and malformed JSON; zod 4 `path` arrays joined with `.`; `text` never echoed
- [x] Unknown-speaker warn reads the raw body value (parsed value can't distinguish)
- [x] `domain/truncate.ts` per SPEC §2.2 with unit tests (60/120, underscore boundary, no "…")
- [x] `GET /health` → `{status:"ok", mode, version, timestamp}`; mode matches `OUR_HEALTH_MODE_RE`
- [x] `processing_latency_ms` via `performance.now()` from handler entry
- [x] Tests (`app.inject`): `contract.missing-text-400`, `contract.malformed-body-400`, `contract.missing-acoustics-200`, `contract.unknown-speaker`, `contract.body-too-large-413`, `contract.bad-timestamp-200` (`timestamp_ms: 1e20` and `"abc"` → 200), `contract.zod4-missing-keys-200`, **`contract.id-length-512`** (512-char `chunk_id`/`session_id` → 200 and echoed; 513 → 400)

## S1b — Heuristic classifier v1 + reference contract test · backend-dev · 20 min · deps: S1a · review: paired with S1a
- [x] `heuristics/` implements `Classifier` port; word-boundary regex lexicon ("no" ≠ "know" test); deflection + ultimatum markers; confidence ≤ 0.6; always `ok:true`
- [x] Emits all 7 labels on at least one unit-test input each (inputs invented, not from the brief)
- [x] Contract test: the brief's sample request shape → 200 + schema-valid, **asserting shape only, not the label**
- [x] Contract test: our `/health` and response keys ⊇ reference keys; record reference empty-body behaviour in handoff (SPEC §2.4)
- [x] `boot.no-keys.serves-heuristic`; **`pipeline.empty-text-neutral` (`""`) and `pipeline.whitespace-text-neutral` (`"   "`, `"\n\t"`)** → 200 neutral, classifier not called (spy), uses `isBlankText`

## S2a — Dataset v1 · eval-engineer · 40 min · deps: FREEZE (parallel with S0/S1)
- [x] **≥ 80 chunks, ≥ 10 sessions**, `apps/backend/eval/datasets/*.jsonl` + `SCHEMA.md`; labels + `acceptable_sentiments` + rationale written **before** any model run
- [x] Coverage matrix per eval-methodology skill (7 labels × both speakers, 4 risk levels, volatility true/false, agree vs contradict, counterfactual + context-flip pairs, hard negatives, ≥ 3 injection chunks)
- [x] The brief's example sentence pattern appears in ≥ 3 contexts with **different** labels
- [x] Split `tune.jsonl` / `holdout.jsonl` by session (75/25); smoke subset of 15 tagged

## S2b — run-eval.ts · eval-engineer · 25 min · deps: S2a, S1b
- [x] Replaces the S0 stub script; `npm run eval -- --target <url> --label <name> [--split] [--smoke]`; payloads typed by `TelemetryRequestWireSchema`; sessions parallel (≤ RPM), chunks sequential in timestamp order
- [x] `reports/eval-latest.md`: strict/lenient acc, macro-F1, per-class P/R/F1, 7×7 confusion, nuance subset, volatility P/R/F1, risk MAE, provider mix, failure table, baseline column
- [x] Baseline run against reference on :3001 committed; `eval:smoke` exits non-zero below threshold (threshold value in handoff)

## S2c — bench.ts + simulate · eval-engineer · 25 min · deps: S1b
- [x] Scenarios: 200 sequential / 20 sessions × 10 concurrent / cold-boot first 5; client `performance.now()` + server `processing_latency_ms`
- [x] Reports p50/p95/p99/max, provider mix, fallback %, heuristic %, **deadline-timeout %**, 429 count, `finish_reason:length` count, RPM used; writes `<!-- metrics {"p50":..,"p95":..} -->`; `--quick` mode for gate
- [x] `npm run simulate` streams a scripted negotiation at 1–3 s cadence to :3000

## S3a — OpenAI-compatible adapter + parse · backend-dev · 30 min · deps: S1b · review: paired with S3b
- [ ] One adapter class (`fetch` + undici keep-alive Agent); body per ADR-001; 429→`rate_limited` (+retry-after), 5xx/network→`http`, abort→`timeout`; never throws
- [ ] Optional `LLM_PRIMARY_REASONING_EFFORT` / `LLM_FALLBACK_REASONING_EFFORT` (empty ⇒ field omitted; when set, also `include_reasoning:false` for Groq) so the CP1 A/B can run gpt-oss-20b fairly; add the names to `.env.example` (empty values)
- [ ] `response_format` rejected ⇒ retry once without, logged once (`adapter.json-mode-unsupported`); `adapter.network-error-is-http`
- [ ] `parse.ts`: fences, first `{…}`, zod, enum casing/synonyms, clamp c, default r; empty `choices`/null content/`finish_reason:length` ⇒ `bad_json`; tests `parse.*`
- [ ] Non-blocking warm-up per provider on boot
- [ ] No real API calls in `npm test` (fake fetch)

## S3b — Prompt v1 + pipeline wiring + deadline · backend-dev · 25 min · deps: S3a · review: paired with S3a
- [ ] `llm/prompt.ts`: static system prefix (condensed taxonomy + schema + 4–6 contrastive few-shots, ≤ ~550 tokens) then dynamic user block (SPEC §6 format, `<<< >>>`); exports `PROMPT_VERSION`; token count logged in handoff
- [ ] `services/analyze-chunk.ts` uses primary classifier with deadline AbortController **counted from t0** → heuristic on failure
- [ ] Manual Groq smoke with a real key (human-run) recorded; bench p50 recorded in handoff → **CP1 input**
- [ ] Gemini `json_object` acceptance + output fits 90 tokens verified with a real key → request to spec-architect to update ADR-001 UNVERIFIED rows

## S3c — CP1 model A/B (mandatory) · eval-engineer · 25 min · deps: S3b, S2b, S2c · at CP1 (~2:50–3:20)
- [ ] Run tune split + `bench --quick` twice against our backend with env overrides only (no `.env` edits): (A) `LLM_PRIMARY_MODEL=llama-3.1-8b-instant`; (B) `LLM_PRIMARY_MODEL=openai/gpt-oss-20b`, `LLM_PRIMARY_REASONING_EFFORT=low`
- [ ] Same `LLM_MAX_TOKENS`, same prompt version, same throttle (RPM noted); run regardless of nuance scores
- [ ] `reports/ab-cp1.md`: macro-F1, nuance-subset accuracy, per-class F1, p50/p95, heuristic %, deadline-timeout %, `finish_reason:length` count, for both
- [ ] Recommendation to the human (winner by macro-F1 subject to p50 < 250); human sets `LLM_PRIMARY_MODEL`; request to spec-architect to amend ADR-001 with the report link

## S4a — Sequential fallback chain + breaker + caps · backend-dev · 25 min · deps: S3b · review: single
- [ ] `fallback-chain.ts` as a `Classifier` of `Classifier`s: try providers in order; move to the next **only** on `http`/`bad_json`/`rate_limited`/`circuit_open`/`no_key`/in-flight cap; **no timer hedge, no parallel calls**; next provider gets `deadline − elapsed`
- [ ] Deadline counted from t0: on expiry abort in-flight call → heuristic immediately (timeout counts toward the breaker)
- [ ] Per-provider breaker (`LLM_CIRCUIT_FAILURES`, `LLM_CIRCUIT_COOLDOWN_MS`, ≥ retry-after); 401/403 disables provider + recomputes `/health.mode`
- [ ] Per-provider in-flight cap `LLM_MAX_INFLIGHT` (default 16)
- [ ] Tests with fake classifiers + fake timers: `chain.429-falls-back`, `chain.error-falls-back`, `chain.circuit-open-skips`, `chain.slow-primary-no-hedge` (fallback never called while primary is pending), `chain.deadline-heuristic`, `chain.all-open-instant-heuristic`, `chain.bad-json-next`, `chain.single-provider`, `chain.auth-error-disables-provider`, `chain.inflight-cap-skips`

## S4b — Heuristic hardening + exception safety · backend-dev · 15 min · deps: S4a, S2b · review: single
- [ ] Fix top heuristic failure cluster from the S2 baseline report (one change, eval numbers before/after in handoff)
- [ ] `pipeline.exception-falls-back`: any thrown error in service ⇒ heuristic 200
- [ ] Each chunk logs `{chunk_id, session_id, provider, latency_ms, outcome}`; no text at info

## S5a — SessionStore + acoustic baseline + counters · backend-dev · 30 min · deps: S3b · review: paired with S5b
- [ ] `session/` per ADR-004: snapshot (K turns ≤ 40 words, baselines, prev per speaker); commit synchronously in the same tick right after `reply.send()`; ordered insert; idempotent chunk_id Set (FIFO 5000); LRU `MAX_SESSIONS`; TTL sweep (unref'd timer)
- [ ] Running summary counters (chunk_count, flagged_count, per-sentiment counts, bounded top-3 high/critical list) independent of the 200-record cap
- [ ] Empty/whitespace-only text chunks: counters only, no context/baseline update
- [ ] `domain/acoustic-baseline.ts`: Welford, priors (SPEC §4), std floor, z clamp, imputed fields skipped; descriptors for prompt
- [ ] Tests: `session.out-of-order-commit`, `session.duplicate-idempotent`, `session.lru-evicts`, `session.auto-create`, `pipeline.client-abort-still-commits`, baseline unit tests

## S5b — Fusion (volatility, confidence, risk) + concurrency · backend-dev · 30 min · deps: S5a · review: paired with S5a
- [ ] `domain/volatility.ts`, `risk.ts`, `fusion.ts` per SPEC §5 / ADR-003, pure; order volatility → confidence → risk; unit tests for every floor/ceiling (ceiling uses calibrated confidence)
- [ ] **Unit tests for both SPEC §5.1 worked examples:** (1) prev positive → cur aggressive, Δarousal_z = 1.5, pitch 0.8 ⇒ `v = 0.86`, flag true; (2) prev negative → cur aggressive, Δarousal_z = 0, pitch 0.2 ⇒ `v = 0.16`, flag false (threshold 0.6)
- [ ] Prompt receives context + acoustic descriptors from S5a
- [ ] `session.concurrency-no-bleed`: 20 sessions × 10 chunks in parallel ⇒ no context/baseline/counter bleed; `chunk_id` echo correct for 20 parallel requests
- [ ] Gate green with bench; p50/p95 in handoff

## S6a — Frontend scaffold + data hook · frontend-dev · 45 min · deps: FREEZE (against reference :3001)
- [x] Vite + React + TS strict; imports only `@app/contracts`; proxy `/api`,`/ws` to `VITE_API_TARGET` (default :3000)
- [x] `useTelemetry()` store: POST responses, dedupe by `chunk_id`, zod-validated, ring buffer 200/session
- [x] Re-add `apps/frontend` to root `typecheck` (Vite `noEmit` is not a composite `tsc -b` reference — use `tsc --noEmit -p apps/frontend` or a composite config; coordinate the root `package.json` script line with backend-dev via request file)
- [x] `npm run dev:frontend` works against `npm run reference`

## S6b — Four mandatory widgets · frontend-dev · 50 min · deps: S6a
- [x] Traffic light (colour + icon + text; critical pulse respects reduced motion), Sentiment stream, Volatility alert (role=alert, 8 s decay), Mitigation panel (aria-live, copy)
- [x] All four visible at 1280×800 without scroll; contrast ≥ 4.5:1; LLM strings rendered as text only
- [x] Build passes; screenshot attached to handoff

## S6c — WS hook + header + basic demo button · frontend-dev · 40 min · deps: S6b, S7a (mock until then)
- [x] WS `/ws/telemetry` with backoff 0.5→8 s + jitter; frames validated with `ServerMessageSchema`; merges with POST store
- [x] Header shows current session id, connection state, `/health.mode`, rolling p50
- [x] **Basic "Play demo" button**: POSTs a short scripted negotiation (≥ 8 chunks, payloads typed by `TelemetryRequestWireSchema`) at 1–3 s cadence; works against the reference backend too. No keyboard shortcuts, session selector or narrow layout (S9 cut)

## S7a — WS gateway · backend-dev · 20 min · deps: S5b · review: single
- [ ] `/ws/telemetry`: hello on connect; analysis broadcast after commit; Origin check vs `CORS_ORIGIN` — missing or mismatching ⇒ 1008; drop slow clients > 1 MB buffered
- [ ] Tests `ws.origin-rejected`, `ws.origin-missing-rejected`, `ws.slow-client-dropped` + one e2e receive test

## S8a — Prompt iterations (≤ 3) · eval-engineer · 40 min · deps: S5b, S3c
- [ ] Each iteration: one hypothesis, one change in `prompt.ts` (bump `PROMPT_VERSION`), re-run tune on the CP1 winner model; keep iff macro-F1 ↑ and p50 Δ < +20 ms
- [ ] `reports/PROMPT_CHANGELOG.md` with numbers per iteration

## S8b — Holdout + final reports · eval-engineer · 30 min · deps: S8a
- [ ] Holdout run once; ours vs reference columns; `reports/eval-latest.md` + `bench-latest.md` committed
- [ ] Volatility weights/threshold change (if any) proposed to spec-architect for ADR-003 with report link

## S10 — Session summary endpoint · backend-dev · 15 min · deps: S5a counters · review: single · **second cut, kept until CP2 (H4)**
- [ ] `GET /api/telemetry/session/:sessionId/summary` per SPEC §5.4 from running counters; `SessionSummarySchema.parse` before send
- [ ] `aggregated_volatility_score` = flagged/chunk_count (2dp); `top_risk_moments` only high/critical, risk desc then most recent first, ≤ 3, may be `[]`; `text_excerpt` real text ≤ 80
- [ ] 404 `{error:"session_not_found"}` for unknown and evicted sessions
- [ ] Integration test incl. unknown session, duplicate chunk not double-counted, tie-break on dominant sentiment

---
## Cut slices (human decision 2026-10-11 — do not implement)
- ~~S7b — LRU verdict cache~~ (H1; ADR-004). Re-introduction requires a new ADR.
- ~~S9 — Demo player polish~~ (H5): keyboard shortcuts, session selector, narrow-screen layout. A basic demo button lives in S6c.

## Ticket lines for TODOs
- T1 (S4b, from S1-r1 N3) Heuristic negation: "This is not good." → positive; ULTIMATUM ignores negation ("We don't want to walk away" → critical).
- T2 (S4b, S1-r1 N3) Over-broad markers: "sign today" → aggressive/critical; sincere "thanks a lot" / "Sure, that works" / "make sure" → sarcastic; "You never know" → aggressive; board/legal/stakeholders unconditional → narrow to deferral constructions. `pick()` precedence only for equal fits.
- T3 (S2a, S1-r1 N3) Add the T1/T2 sentences (reworded, invented) as adversarial dataset cases.
- T4 (S5a, S1-r1 N4/N11) Pass speaker-baseline z-scores into the heuristic; move unknown-speaker warned-set into SessionStore.
- T5 (S3a/S4a, S1-r1 N1/N7/N13) Log swallowed classifier exceptions and ≥500 errors (err.code only for 4xx, never text); chain enforces deadline itself.
- T6 (any backend slice, S1-r1 N2/N5/N8/N9/N10/N12/N14) Test hardening: sync-throw classifier, perf assertion → 1 ms/median, no-echo for invalid text + malformed JSON, info-level log-key assertion, WARN-once, 20-parallel chunk_id echo; precompile regexes.
- [done 2026-10-11] T7 (backend-dev, before S2b approval; S2a-r1 N12) Gate typecheck must cover `apps/backend/eval/**/*.ts` and `apps/backend/test/**/*.ts` (e.g. `tsconfig.eval.json` noEmit, same strict flags, references contracts) chained into root `typecheck`.
- T8 (eval-engineer, S2b; S2a-r1 N3–N11, r2 N1) Dataset polish + reporting: clean 4th counterfactual pair (cf-number confounded); s06_c08 tie-break; s09_c04 context; s07_c08 missing payment-terms turn; sincere "Sure, that works" + non-deferral "stakeholders"; s10_c06 risk consistency; SCHEMA rule wording (per-speaker, delivery-spike anchor). S2b reports must print the constant-neutral lenient floor (45.3% overall, 6/15 smoke); smoke threshold on lenient accuracy well above floor; smoke numbers never cited as quality. Label edits only with rationale + changelog.
- T9 (S5a/S5b; S2a-r1 N2) Pin sample vs population std; unit-test that the speaker baseline excludes the current chunk (5 of the true labels depend on it). ADR-003 evidence: formula flags de-escalations and misses flat-delivery stance flips (see S2a validator table).
