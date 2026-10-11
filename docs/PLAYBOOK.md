# PLAYBOOK — 9-hour agentic delivery plan

> The brief estimates 12–16 h. We have 8–9. That only works if (a) the contract is frozen early,
> (b) scope is cut ruthlessly at checkpoints, and (c) humans make decisions while agents do typing.
> You are the tech lead; the agents are your team. **You approve every gate.**

---

## 1. How the agents actually collaborate (and what they can't do)

```
                 ┌──────────────── you (human): FREEZE / APPROVE / CUT ─────────────────┐
                 ▼                                                                      │
 /kickoff → spec-architect ──SPEC.md + contracts──► code-reviewer (spec review) ────────┤
                                                                                        │
 /slice Sx → backend-dev ┐                                                              │
            frontend-dev ┼─ handoff file ─► npm run gate ─► code-reviewer ─► APPROVE ───┤
            eval-engineer┘        ▲                              │ REQUEST_CHANGES      │
                                  └────── blocking findings ─────┘  (max 2 loops)       │
 /eval     → eval-engineer ⇄ backend-dev (requests) → reports/*.md ──────────────────────┤
 /audit    → security-auditor ‖ code-reviewer → ship-blockers.md → owner agents ─────────┤
 /ship     → docs-writer (evidence only) → clean-clone test → checklist ─────────────────┘
```

Reality check:
- Claude Code subagents run in **isolated contexts** and cannot message each other. "Collaboration" = the
  main session orchestrating + **files as the shared bus** (`specs/`, `.agent-work/handoff|reviews|requests/`, `reports/`).
  That's a feature: every handoff is auditable and becomes material for AI_COLLABORATION.md.
- Parallelism is real only where lanes don't overlap: backend ‖ frontend after contract freeze; eval dataset ‖ backend scaffolding.
  Review and gate stay sequential.
- Hooks enforce what prompts can't: no secrets written, no `.env` reads, no `git push`, lint on every edit,
  no "done" with red typecheck.

---

## 2. Recommended slices (spec-architect refines these in `specs/TASKS.md`)

| ID | Owner | Slice | Acceptance (abridged) |
|---|---|---|---|
| S0 | backend-dev | Monorepo scaffold, TS strict, eslint/prettier, vitest, root scripts | all §5 commands exist; `npm run gate` runs (stubs ok) |
| S1 | backend-dev | Contracts wired, `POST /api/telemetry/stream` with **heuristic** classifier, `/health` | schema-valid responses w/o keys; 400 on bad payload; integration tests |
| S2 | eval-engineer | Dataset v1 (≥ 60 chunks, 8 sessions) + `run-eval.ts` + `bench.ts` + `simulate` | reports generated against S1 baseline |
| S3 | backend-dev | OpenAI-compatible adapter, prompt v1, parse, JSON mode, deadline | Groq path works; fake-classifier unit tests; bench p50 recorded |
| S4 | backend-dev | Fallback chain: hedging, 429 handling, circuit breaker, heuristic last | tests for timeout/429/bad JSON/no key |
| S5 | backend-dev | SessionStore (context K turns, per-speaker baselines, TTL), domain fusion (volatility, risk floors) | concurrency test: 20 sessions no bleed; volatility unit tests |
| S6 | frontend-dev | Dashboard: 4 required widgets + WS hook | build passes; screenshot |
| S7 | backend-dev | WS gateway `/ws/telemetry` + broadcast, LRU cache | WS e2e test; bench cache on/off |
| S8 | eval-engineer | Prompt iterations (≤ 3) + holdout | PROMPT_CHANGELOG with numbers |
| S9 | frontend-dev | Demo player, session selector, latency readout, polish | — |
| S10 | backend-dev | `GET /api/telemetry/session/:sessionId/summary` (shape = reference backend) | 404 unknown; top-3 by risk then recency; integration test |

---

## 3. Timeline (9 h, with hard checkpoints)

| Time | Main session command | In parallel | Your decision at the end |
|---|---|---|---|
| 0:00–0:40 | `/kickoff` | — | **FREEZE** contract; answer open questions |
| 0:40–1:20 | `/slice S0` then `/slice S1` | eval-engineer starts S2 dataset (labels before any model output!) · **frontend-dev starts S6 against `npm run reference` (:3001)** | — |
| 1:20–1:50 | `/slice S2` — eval runs against **reference (:3001)** = baseline | S6 continues | Baseline numbers exist? |
| 1:50–3:20 | `/slice S3`, `/slice S4` | S6 review | **CP1 (3:20):** Groq p50 < 300 ms? If not → switch model/provider now, not later |
| 3:20–4:20 | `/slice S5` | frontend switches proxy to :3000, adds WS | — |
| 4:20–5:00 | `/eval 2` | — | **CP2 (5:00):** behind? cut S9 + cache; keep WS |
| 5:00–5:50 | `/slice S7`, `/slice S10` (summary, ~25 min) | `/slice S9` if not cut | — |
| 5:50–6:30 | `/eval 1` + holdout | — | Freeze prompt |
| 6:30–7:20 | `/audit` | — | **CP3 (7:20):** zero critical/high? else fix only those |
| 7:20–8:20 | `/ship` | You: record video draft | — |
| 8:20–9:00 | Buffer / clean-clone re-test / private repo + access | — | Submit |

**Cut order if late** (lowest value per minute first): S9 polish → S10 summary → LRU cache → hedging (keep simple fallback) →
session selector → WS (POST-driven demo still satisfies "live results"). **Never cut:** eval report, fallback to heuristic, the four UI widgets, docs.

---

## 4. Daily operating rules for you (the human)

1. One slice per `/slice` call. Don't let the main session "also quickly" do another slice — context bloat kills quality.
2. `/clear` between phases; the agents re-read CLAUDE.md + specs anyway. Files are memory, chat is not.
3. Read every reviewer verdict (30 seconds). If you never disagree with the reviewer, you're not reading it.
4. Commit after every approved slice. `git revert` is your undo for bad agent runs.
5. When an agent fails twice on the same thing, take the keyboard for 10 minutes — it's usually faster.
6. Log AI failures in `.agent-work/ai-log.md` yourself too — the interview will ask.

---

## 5. Latency engineering checklist (25% of score)

- [ ] Groq small/fast model as primary (verify current IDs); measure 8B-class vs larger — pick by **eval + bench**, not by name
- [ ] Keep-alive dispatcher; warm-up request on boot (first TLS handshake otherwise lands on the first scored chunk)
- [ ] JSON mode, compact keys, `max_tokens ≈ 90`, `temperature 0`
- [ ] Static system prompt prefix (provider-side prompt caching), dynamic part last; prompt ≤ ~700 tokens total
- [ ] Context = last 3 turns, each truncated to ~40 words
- [ ] Hedge to fallback provider at ~`LLM_HEDGE_AFTER_MS=300`; hard deadline ~`450` → heuristic
- [ ] Circuit breaker on 429 so rate-limits don't cost a timeout each
- [ ] Bench from a clean boot AND warm; report both
- [ ] Document honestly: latency depends on evaluator's network location and their key's rate limits

---

## 6. Submission checklist

- [ ] `npm install && cp .env.example .env && npm start` works on a clean clone; backend on :3000
- [ ] Works **with no API key** (heuristic mode) and with Groq-only, Gemini-only keys
- [ ] `npm run dev:frontend` shows all 4 required widgets
- [ ] `.env.example` lists every variable; no secrets in git history
- [ ] README (track A stated), SETUP, ARCHITECTURE, AI_COLLABORATION present and evidence-based
- [ ] `reports/eval-latest.md` + `reports/bench-latest.md` committed
- [ ] `docs/assignment/` NOT in the repo; repo is **private**
- [ ] Walkthrough video < 5 min recorded

## 7. Walkthrough video outline (≤ 5 min)

1. 0:00–0:30 Problem + track choice + one-line architecture
2. 0:30–1:45 Live demo: `npm run simulate` → dashboard reacts (sarcasm, shift → volatility alert, critical risk)
3. 1:45–3:00 **Biggest decision:** LLM-for-semantics / code-for-math fusion + Groq→Gemini→heuristic chain with deadline. Show bench p50/p95.
4. 3:00–4:00 Quality: dataset design (contradiction pairs, holdout), confusion matrix, one honest failure cluster
5. 4:00–4:45 Agentic workflow: agents, hooks, reviewer catching a real bug (from ai-log)
6. 4:45–5:00 Limitations + next steps
