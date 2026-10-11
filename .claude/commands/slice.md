---
description: Build one slice end-to-end — implement → gate → review → (max 2 fix loops) → done
argument-hint: <slice-id e.g. S3>
---
Slice: **$ARGUMENTS**

Orchestrate strictly in this order. You (main session) only coordinate; subagents do the work.

1. Read `specs/TASKS.md` for $ARGUMENTS: owner agent, acceptance criteria, dependencies. If a dependency is not ticked, stop and report.
2. Delegate implementation to the owner agent (`backend-dev`, `frontend-dev` or `eval-engineer`). Pass: slice id, acceptance criteria verbatim, and the path of any previous review file.
3. Run `npm run gate` yourself. If red, send the failure tail back to the same agent (counts as fix loop 1).
4. Delegate to **code-reviewer** with the slice id. Read the verdict file.
5. REQUEST_CHANGES → send only the *blocking* findings back to the owner agent → re-gate → re-review. **Max 2 loops.** After that, stop and escalate to the human with a 5-line summary.
6. APPROVE → tick the criteria in `specs/TASKS.md`, then `git add -A && git commit -m "feat($ARGUMENTS): <summary>"` (never push).
7. Report to the human: what changed, gate numbers (p50/p95, tests), reviewer verdict, any new risks — max 10 lines.

Parallelism: if the human passes two independent slices with different owners (e.g. backend + frontend), you may run both implementation steps concurrently, but gate and review them sequentially.
