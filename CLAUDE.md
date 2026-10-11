# CLAUDE.md — Sentiment Intelligence Engine (Track A, Full-Stack)

This file is the **single source of truth** for every agent working in this repo.
If anything here conflicts with an agent prompt, a spec, or a chat instruction, **this file wins**
unless the human explicitly overrides it in the current conversation.

---

## 1. Mission (what "done" means)

Build a real-time negotiation **Sentiment Intelligence Engine**:
`POST /api/telemetry/stream` takes one transcript chunk + acoustic metadata and returns
sentiment, hidden intent, volatility, risk and a mitigation suggestion — **fast** and **nuanced**.
Plus a lean live dashboard, an evaluation harness, and honest docs.

Scoring weights drive every trade-off:

| Dimension | Weight | Our lever |
|---|---|---|
| Nuance detection | 30% | Context-aware prompt, acoustic *baselines*, eval-driven iteration |
| Architecture | 25% | Shared typed contracts, pure domain core, ports/adapters for LLMs |
| Latency | 25% | Groq first, hard deadline, error-driven fallback, keep-alive, tiny output |
| UI/UX | 15% | Glanceable, single-screen copilot — not a feature zoo |
| Docs | 5% | Numbers taken from real eval/bench reports only |

**"Going beyond" means depth, not breadth:** a reproducible eval with a confusion matrix,
a latency benchmark with p50/p95, graceful degradation, and contract tests. No auth, no DB,
no Docker-compose zoo, no extra pages.

---

## 2. Non-negotiable invariants (agents MUST NOT violate)

1. **The API contract is frozen** once `specs/SPEC.md` is approved. It lives in
   `packages/contracts/src/telemetry.ts` (zod). Field names, enums and limits are copied
   *verbatim* from the assignment. Changing it requires a new ADR + human approval.
   **Be lenient on input like the reference backend:** missing/partial `acoustic_metadata` → neutral defaults
   (never 400, never 500). Return 400 only when `chunk_id`, `session_id` or `text` is missing/invalid.
   `GET /health` returns `{status:"ok", mode, version, timestamp}` (same shape as the reference backend;
   `mode` = `"llm:<provider>"` | `"heuristic"`) — the harness may poll it for readiness.
2. **Every response is schema-valid.** Output is parsed with zod *before* sending.
   `hidden_intent` ≤ 60 chars, `mitigation_suggestion` ≤ 120 chars — truncate on a word boundary, never fail.
3. **The endpoint never 5xx's because of the LLM.** Chain: Groq → Gemini → rule-based heuristic.
   Missing API keys ⇒ server still starts and serves heuristic results (logs a WARN once).
4. **Latency budget:** p50 < 250 ms, p95 < 500 ms measured end-to-end by `npm run bench`.
   A hard deadline (`LLM_DEADLINE_MS`) is enforced with `AbortController`. No artificial delays.
5. **LLM does semantics, code does math.** Volatility score, acoustic baselines, risk floors/ceilings
   are deterministic TypeScript in `domain/`. The LLM never computes numbers we can compute.
6. **No session state bleed.** All state is keyed by `session_id`; no module-level mutable state
   outside `SessionStore` / caches. Concurrent sessions must be tested.
7. **No secrets in code, logs, fixtures or docs.** Only `.env.example` lists variable *names*.
   Never print request text at `info` level (it is negotiation content) — `debug` only.
8. **No new runtime dependency** without a one-line justification in the PR/commit message.
   Prefer platform (`fetch`, `AbortController`, `performance.now()`) over SDKs.
9. **Numbers in docs come from files.** ARCHITECTURE.md metrics must cite
   `reports/eval-latest.md` / `reports/bench-latest.md`. Never invent accuracy or latency figures.
10. **Do not commit the assignment text** (`docs/assignment/` is git-ignored — the brief asks us not to publish it).

### Reference backend (provided by the hiring team, Track C placeholder)
Lives at `docs/assignment/reference-backend/` (git-ignored, read-only). We do **not** extend it — it is
CommonJS/Express/untyped and its logic is a deliberately weak placeholder. We use it for exactly three things:
1. **Contract oracle** — our responses and `/health` must be shape-compatible with it (contract test in S1).
2. **Eval baseline** — `npm run reference` serves it on :3001; `npm run eval -- --target http://localhost:3001 --label reference`
   produces the "before" column. ARCHITECTURE.md reports ours vs. reference on the same dataset.
3. **Frontend unblocker** — frontend-dev builds against it (`VITE_API_TARGET=http://localhost:3001`) before our backend is ready.

Known weaknesses we must **not** copy: absolute acoustic thresholds (`wpm > 190`), substring lexicon
(`"no"` matches "know"), never emits sarcastic/deflecting/appeasement, no context, no input validation
(missing body ⇒ 200 with no `chunk_id`), `cors()` wide open, unbounded session `Map`, `Date.now()` latency, constant mitigations.

### Session summary (Track B extra — cheap insurance, slice S10)
`GET /api/telemetry/session/:sessionId/summary` → `{session_id, chunk_count, aggregated_volatility_score,
dominant_sentiment, top_risk_moments[≤3]}`, 404 for unknown session. Shape matches the reference backend;
`top_risk_moments[].text_excerpt` contains a real ≤ 80-char excerpt (the reference puts hidden_intent there).

---

## 3. Architecture

```
repo/
├─ package.json                # npm workspaces + root scripts (see §5)
├─ .env.example
├─ packages/
│  └─ contracts/               # zod schemas + inferred TS types (shared by BE + FE)
│     └─ src/{telemetry.ts,ws.ts,index.ts}
├─ apps/
│  ├─ backend/                 # Fastify + TS strict, port 3000
│  │  ├─ src/
│  │  │  ├─ server.ts          # composition root ONLY (wire deps, start)
│  │  │  ├─ config.ts          # env parsed by zod; single import point for config
│  │  │  ├─ http/              # routes + WS gateway (thin: validate → service → serialize)
│  │  │  ├─ services/analyze-chunk.ts   # orchestration use-case
│  │  │  ├─ domain/            # PURE functions, no I/O: acoustic-baseline, volatility, risk, fusion, truncate
│  │  │  ├─ llm/               # port `Classifier` + adapters: openai-compatible, fallback-chain, prompt, parse
│  │  │  ├─ heuristics/        # rule-based Classifier (last-resort fallback, also no-key mode)
│  │  │  ├─ session/           # SessionStore: per-session rolling context + speaker baselines (TTL/LRU)
│  │  │  └─ infra/             # lru-cache, logger, clock, http keep-alive agent
│  │  ├─ test/                 # vitest: unit (domain) + integration (fastify.inject)
│  │  └─ eval/                 # datasets/*.jsonl, run-eval.ts, bench.ts
│  └─ frontend/                # Vite + React + TS, port 5173, proxies /api & /ws to :3000
│     └─ src/{app,components,hooks,lib}
├─ reports/                    # generated: eval-latest.md, bench-latest.md (committed)
├─ specs/                      # SPEC.md, TASKS.md, adr/NNN-*.md
├─ .agent-work/                # agent handoffs + ai-log.md (feeds AI_COLLABORATION.md)
└─ ARCHITECTURE.md · AI_COLLABORATION.md · SETUP.md · README.md
```

### Dependency rule
`http → services → (domain, llm, heuristics, session)`; `domain` imports nothing but `contracts`.
`llm` adapters implement `interface Classifier { classify(input: ClassifyInput, signal: AbortSignal): Promise<LlmVerdict> }`.
Frontend imports only `@app/contracts` from the backend world — never backend source.

### Request pipeline (`analyze-chunk.ts`)
```
t0=performance.now()
1 validate (zod)                                   ~0.2ms
2 session.snapshot(session_id)  → last K=3 turns + speaker acoustic baseline
3 domain.acousticFeatures(chunk, baseline) → z-scores + discrete descriptors ("pitch: much higher than this speaker's norm")
4 (verdict cache cut at freeze — H1)
5 classifier.classify(prompt, deadline)            Groq ─(error / 429 / circuit-open)→ Gemini ─(error)→ heuristic; deadline (from t0) → heuristic directly
6 domain.fuse(verdict, features, prevState) → volatility_flag, risk_level floors/ceilings, confidence calibration
7 truncate + ResponseSchema.parse
8 session.commit(...) (synchronous, same tick right after reply.send) ; ws.broadcast(result)
processing_latency_ms = round(performance.now()-t0)
```

### Key design decisions (each needs an ADR in `specs/adr/`)
- **One OpenAI-compatible adapter** for Groq, Gemini (OpenAI-compat endpoint), Cerebras and Ollama —
  provider = `{baseUrl, apiKey, model}` from env. Evaluators bring their own keys; any of these works.
- **JSON mode + compact keys** in the LLM output (`{"s","c","i","m","r","sh"}`), `max_tokens ≈ 90`,
  `temperature 0`. Mapped to the public contract in `llm/parse.ts`.
- **Static system prompt first, dynamic content last** (maximises provider-side prompt caching).
- **Per-speaker acoustic baseline** (running mean/std per `session_id × speaker`): 187 wpm means
  different things for different people. Cold start uses population priors.
- **No per-session lock on the LLM call.** Context is a snapshot at arrival; commits are ordered by `timestamp_ms`.
  Out-of-order chunks are accepted.
- **Speaker-aware mitigation:** counterpart chunk → how to respond; candidate chunk → coach the candidate
  (e.g. "You're conceding early — anchor on value first").

---

## 4. Coding standards

- TypeScript `strict: true`, `noUncheckedIndexedAccess: true`, `exactOptionalPropertyTypes: true`. No `any`; `unknown` + zod at boundaries.
- ESM only. Node ≥ 20. Named exports. Files ≤ ~200 lines; functions ≤ ~40 lines.
- Errors: typed `Result`-style returns inside `llm/` (`{ok:false, reason:'timeout'|'rate_limited'|'bad_json'|'http'}`); never throw across the classifier port.
- Logging: pino; structured; `{chunk_id, session_id, provider, latency_ms, outcome}`. No request text at info.
- Tests: vitest. Domain = pure unit tests. HTTP = `app.inject()` integration tests. LLM = fake `Classifier`; never hit real APIs in `npm test`.
- Frontend: function components + hooks, no global state library; CSS modules or one plain CSS file; accessible colors (traffic light also has text/icon, not color only).

---

## 5. Commands (root)

| Command | What it does |
|---|---|
| `npm install` | Installs all workspaces |
| `npm start` | Builds contracts + starts backend on :3000 (prod mode) |
| `npm run dev` | Backend in watch mode (tsx) |
| `npm run dev:frontend` | Vite dev server on :5173 |
| `npm run typecheck` | `tsc -b` across workspaces |
| `npm run lint` | eslint (+ prettier check) |
| `npm test` | vitest unit + integration (no network) |
| `npm run eval` | Runs labelled dataset against running backend → `reports/eval-latest.md` |
| `npm run eval:smoke` | 15-chunk subset, fails if strict accuracy < threshold |
| `npm run bench` | 200 chunks seq + 20 concurrent sessions → `reports/bench-latest.md` (p50/p95/p99, fallback rate) |
| `npm run reference` | Runs the provided reference backend on :3001 (baseline + frontend stub) |
| `npm run simulate` | Streams a demo negotiation to :3000 in real time (feeds the dashboard) |
| `npm run gate` | typecheck → lint → test → eval:smoke → bench (fails on budget breach). **Must pass before any "done".** |

Agents: run the narrowest command that proves your change, then `npm run gate` before handing off.

---

## 6. Environment (`.env.example` is authoritative)

`PORT=3000`, `LOG_LEVEL`, `LLM_PRIMARY_*` / `LLM_FALLBACK_*` (`BASE_URL`, `API_KEY`, `MODEL`),
`LLM_DEADLINE_MS`, `LLM_MAX_TOKENS`, `LLM_MAX_INFLIGHT`, `CONTEXT_TURNS`,
`SESSION_TTL_MS`, `VOLATILITY_THRESHOLD`, `CORS_ORIGIN`.
Model IDs on free tiers change frequently — **verify against provider docs at build time** and record in an ADR.

---

## 7. Agent workflow (see `docs/PLAYBOOK.md`)

| Agent | Owns (may write) | Never touches |
|---|---|---|
| `spec-architect` | `specs/**`, `packages/contracts/**` (pre-freeze only) | app code |
| `backend-dev` | `apps/backend/src/**`, `apps/backend/test/**`, root configs | frontend, specs, eval datasets |
| `frontend-dev` | `apps/frontend/**` | backend, contracts |
| `eval-engineer` | `apps/backend/eval/**`, `reports/**`, `apps/backend/src/llm/prompt.ts` (prompt iterations only) | other src |
| `code-reviewer` | `.agent-work/reviews/**` only (read-only on code) | all code |
| `security-auditor` | `.agent-work/security/**` only | all code |
| `docs-writer` | `*.md` at root, `docs/**` | code, specs |

### Skills (`.claude/skills/*/SKILL.md`, human-owned, attached via each agent's `skills:` frontmatter)
| Skill | Canonical for | Used by |
|---|---|---|
| `nuance-taxonomy` | label rules, acoustic cues, intent/mitigation format, risk rubric, volatility formula | spec, backend, eval, docs |
| `api-contract` | fields, limits, lenient input, /health, summary, WS, contract tests | spec, backend, frontend, reviewer, security |
| `llm-provider-integration` | adapter, JSON output, prompt layout, fallback chain, heuristic | spec, backend, reviewer |
| `latency-engineering` | budget, hot-path rules, bench method | spec, backend, eval, reviewer |
| `eval-methodology` | dataset, metrics, iteration loop, baseline | eval, docs |
| `copilot-dashboard-ux` | layout, semantics, data flow, a11y | frontend |
| `llm-app-security` | threat model, checks, injection cases | security, reviewer |
| `evidence-based-docs` | doc skeletons, evidence rule | docs |
Agents never edit `.claude/**` (hook-enforced); they file proposals in `.agent-work/requests/skill-<name>.md`.

Handoffs are files, not memory: each agent ends by writing `.agent-work/handoff/<agent>-<slice>.md`
(what changed, how verified, open risks). **Every agent appends to `.agent-work/ai-log.md`**
whenever AI output was wrong and had to be corrected (raw material for AI_COLLABORATION.md).

Ownership is verified by the reviewer with `git diff --name-only`. Out-of-lane edits = automatic REJECT.

---

## 8. Definition of Done (per slice)

- [ ] Acceptance criteria in `specs/TASKS.md` met and ticked
- [ ] `npm run gate` green; numbers pasted in handoff
- [ ] Reviewer verdict `APPROVE` (max 2 fix loops, then escalate to human)
- [ ] No TODO without a ticket line in `specs/TASKS.md`
- [ ] `ai-log.md` updated if anything went wrong
