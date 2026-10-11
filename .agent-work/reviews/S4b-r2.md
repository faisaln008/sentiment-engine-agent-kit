# S4b review r2 (single, final loop) — APPROVE

> Written by code-reviewer (read-only; no servers, no provider calls); saved by the orchestrator.

Reviewer vitest 18 files / 157 tests. Orchestrator: typecheck 0, lint 0, vitest 157/157. Agent heuristic gate: smoke 9/15 PASS, bench p50 1 / p95 3, errors 0.

## r1 blocking — RESOLVED
- **B1** dataset-specific markers removed (`right. and`, `of course. because`, `i suppose`, `so|how flexible`, `wow`, `trust me`); generalised forms acceptable (`conversation for (later|another day/time|after)` 1 tune hit; `sometime (later|soon|next …)` 0 hits; `we (completely|totally|fully) understand` 1 hit). Remaining tune hits are generic negotiation idioms. Handoff labels tune figures "fitted", corrects the "no dataset sentence copied" claim; ai-log entry added.
- **B2** all r1 false-positive probes now benign (neutral/positive/negative-medium); new probes correct incl. true-positive "Either we close this by Friday or we walk" → aggressive/critical; negated walk-away and "sorry, but…" fixed. Regression tests added.

## Reviewer overfit check (NOT official)
| split | HEAD strict / lenient | now strict / lenient |
|---|---|---|
| tune (n=89, fitted) | 47.2 / 55.1 | 59.6 / 69.7 |
| holdout (n=28) | 46.4 / 57.1 | 46.4 / 64.3 |
Holdout strict flat; +2 lenient from T1/T2 narrowing. Docs must cite eval-engineer's official holdout, not these. 0.07 ms/call.

## Non-blocking
- **N1** smoke 9/15 = threshold, zero margin — inform human/eval-engineer; do not re-fit.
- **N2** "Please sign by Friday so we can start onboarding on Monday." → aggressive/critical (also at HEAD) — ticket.
- **N3** benign deferrals ("touch base next week", "take that back to my team", "conversation for another day") → deflecting/medium — note in ARCHITECTURE limitations.
- **N4** tune F1 sarcastic 0.00, aggressive 0.44 — docs must not claim heuristic sarcasm detection.
- **N5** carried r1 N5/N6/N8.
- **N6** stale overfit paragraph at handoff line 12 (superseded header covers it).

## Checklist — 1–10 PASS
