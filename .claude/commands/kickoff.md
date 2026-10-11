---
description: Phase 0 — produce SPEC, contracts, ADRs and the sliced task plan, then stop for human freeze
---
You are the orchestrator. Do not write application code in this command.

1. Confirm `docs/assignment/README.md` exists. If not, stop and ask the human to place the brief there.
2. Delegate to the **spec-architect** subagent with this brief:
   "Produce specs/SPEC.md, specs/TASKS.md (slices S0–S9 sized for docs/PLAYBOOK.md), ADRs for:
   001 provider strategy (Groq primary, Gemini fallback, heuristic last — verify model IDs and OpenAI-compatible endpoints from official docs),
   002 monorepo + shared zod contracts, 003 volatility & risk fusion (deterministic), 004 concurrency & session state.
   Write packages/contracts/src/telemetry.ts with the exact request/response schemas. End with a self-critique."
3. Delegate to **code-reviewer** to review ONLY the spec and contracts against the brief (contract fidelity, missing failure modes, time-box realism). Output to `.agent-work/reviews/spec-r1.md`.
4. If REQUEST_CHANGES: one fix round with spec-architect, then stop regardless.
5. Print to the human: open questions, the 5 riskiest assumptions, total estimated minutes vs. the time box, and the line
   **"Reply FREEZE to lock the contract and start S0."** Then stop.

$ARGUMENTS
