# Sentiment Intelligence Engine (Track A, full-stack)

A real-time negotiation copilot. `POST /api/telemetry/stream` takes one transcript chunk plus acoustic metadata and returns
sentiment (7 labels, including sarcastic, deflecting, appeasement), hidden intent, a volatility flag, risk level and a
mitigation suggestion. A single-screen dashboard shows the stream live over WebSocket. The LLM does the semantics
(Groq first, Gemini on error, rule-based heuristic as the last resort); deterministic TypeScript does the math
(per-speaker acoustic baselines, volatility, risk floors). With no API key the server still starts and answers in heuristic mode.

**Track:** A (full-stack): Fastify + TypeScript backend, Vite + React dashboard, shared zod contracts.

## Quickstart

```bash
npm install
cp .env.example .env        # optional: add LLM_PRIMARY_API_KEY / LLM_FALLBACK_API_KEY; blank = heuristic mode
npm start                   # backend on http://localhost:3000
npm run dev:frontend        # dashboard on http://localhost:5173 (second terminal)
```

Then `npm run simulate` streams a demo negotiation to the backend and the dashboard updates live.
Details, keys and troubleshooting: [SETUP.md](SETUP.md).

Dashboard screenshot (headless Chrome, reference backend, demo playback; taken before the WS gateway existed):
[.agent-work/handoff/frontend-dev-S6c-screenshot.png](.agent-work/handoff/frontend-dev-S6c-screenshot.png)

## Documents

| Doc | What it covers |
|---|---|
| [SETUP.md](SETUP.md) | Prerequisites, keys, ports, commands, troubleshooting |
| [ARCHITECTURE.md](ARCHITECTURE.md) | Pipeline diagram, provider choice, concurrency, nuance approach, how quality was checked, limitations |
| [AI_COLLABORATION.md](AI_COLLABORATION.md) | Agent roster, prompting patterns, where AI was wrong, validation |
| [specs/SPEC.md](specs/SPEC.md), [specs/adr/](specs/adr/) | Frozen API contract and decision records |

## Headline numbers (read the scope column)

| Number | Value | Scope | Source |
|---|---|---|---|
| Macro-F1, LLM mode (qwen/qwen3.8-27b, prompt v1.3) | 0.77 (strict 77.5%, lenient 95.5%) | **Tune split**, n 89, 12 sessions. Not holdout | [reports/eval-s8a-v1.3.md](reports/eval-s8a-v1.3.md) |
| Macro-F1, reference placeholder backend | 0.21 (strict 36.0%) | Same 89 chunks | [reports/eval-reference.md](reports/eval-reference.md) |
| Client latency p50 / p95, LLM mode | 243 / 392 ms | Observed during the throttled eval (7 RPM). **Not a bench** | [reports/eval-s8a-v1.3.md](reports/eval-s8a-v1.3.md) |
| Client latency p50 / p95, LLM mode, earlier prompt | 249 / 453 ms | `bench --quick`, n 50, prompt v1.1 without session context | [reports/ab-cp1.md](reports/ab-cp1.md) |
| Macro-F1, heuristic mode (no key) | 0.52 | Tune split, **fitted to tune**; do not read as generalisation | [reports/eval-latest.md](reports/eval-latest.md) |
| Client latency p50 / p95 / p99, heuristic mode | 1 / 10 / 13 ms | Full bench, n 400, **heuristic only** | [reports/bench-latest.md](reports/bench-latest.md) |

Not yet measured: the **holdout** eval (28 chunks, 3 sessions) and a **full bench in LLM mode** (both deferred, S8b).
`reports/eval-latest.md` and `reports/bench-latest.md` are heuristic-mode runs and are not LLM results.
The LLM p50 of 243 ms is 7 ms under the 250 ms budget and comes from a throttled eval, so the budget is met nominally, not demonstrated.
See [ARCHITECTURE.md](ARCHITECTURE.md) section 5 and 6.

## Repo map

`packages/contracts` (zod schemas, shared) · `apps/backend` (Fastify; `src/domain` pure math, `src/llm` adapters and prompt,
`src/heuristics`, `src/session`; `eval/` datasets, eval and bench CLIs) · `apps/frontend` (dashboard) · `reports/` (generated eval, bench and prompt changelog) · `specs/` (SPEC, ADRs, TASKS).
