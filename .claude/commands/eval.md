---
description: Run the quality loop — eval + bench, analyse failures, at most N prompt iterations with evidence
argument-hint: [iterations=2]
---
Max iterations: $ARGUMENTS (if empty, use 2; never more than 3)

1. Ensure backend is running on :3000 (`curl -s localhost:3000/health`); if not, start it in the background with `npm start` and wait for health.
2. Delegate to **eval-engineer**: run `npm run eval` and `npm run bench`, then perform up to the requested number of prompt iterations following its loop rules (one hypothesis per iteration, keep only if macro-F1 ↑ and p50 Δ < +20 ms).
3. After the loop, eval-engineer runs the holdout set once and writes results.
4. Delegate to **code-reviewer** to review the `prompt.ts` diff for overfitting and token bloat.
5. Report: before/after table (strict acc, lenient acc, macro-F1, volatility F1, p50, p95, fallback rate), kept vs reverted hypotheses, top 3 remaining failure clusters.
