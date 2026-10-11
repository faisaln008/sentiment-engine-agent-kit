---
name: eval-methodology
description: How to build and run the classification-quality evaluation — dataset design and coverage matrix, labelling protocol, tune/holdout split, metrics (strict/lenient accuracy, macro-F1, confusion matrix, volatility F1, risk MAE), baseline comparison against the reference backend, and the evidence-gated prompt iteration loop. Use for anything under apps/backend/eval or reports/, and when docs describe quality.
---

# Eval methodology

## Dataset (schema: `apps/backend/eval/SCHEMA.md`)
- ≥ 80 chunks, ≥ 10 sessions, realistic B2B scenarios (SaaS renewal, procurement, pricing pushback, legal delay, competitor bluff, deadline pressure, scope creep).
- Coverage matrix, ≥ 4 per cell: 7 sentiments × both speakers; 4 risk levels; volatility true/false;
  words/voice **agree vs contradict**; counterfactual pairs (same text, different acoustics and vice versa); context-flip pairs (same sentence, different previous turn); hard negatives (genuine praise, polite firmness); 3+ prompt-injection chunks from security-auditor.
- Labels follow `nuance-taxonomy` exactly. Write label + `acceptable_sentiments` + `rationale` **before** running any model.
- Optional rigor: label a 20-chunk subset twice (you, then a fresh-context subagent) and report agreement — it bounds achievable accuracy.
- Split: `tune.jsonl` (75%) / `holdout.jsonl` (25%) by **session**, not by chunk (avoid context leakage).

## Running
`npm run eval -- --target http://localhost:3000 --label ours [--split tune|holdout] [--smoke]`
Replay sessions in timestamp order, sessions in parallel (≤ provider RPM), chunks within a session sequential.

## Metrics (all in `reports/eval-latest.md`)
- Strict accuracy, lenient accuracy (`acceptable_sentiments`), **macro-F1** (headline — class imbalance), per-class P/R/F1, 7×7 confusion matrix
- Nuance subset accuracy (sarcastic + deflecting + appeasement + contradiction-tagged)
- Volatility P/R/F1; risk ordinal MAE + exact match
- Provider mix and per-provider accuracy (does quality collapse on fallback?)
- Failure table: chunk_id, expected, got, confidence, tags
- **Baseline column**: same metrics for the reference backend on :3001

## Iteration loop (max 3 per /eval)
1. Cluster failures → 2. one hypothesis → 3. one change in `prompt.ts` → 4. re-run tune → 5. keep iff macro-F1 ↑ and p50 Δ < +20 ms → 6. log in `reports/PROMPT_CHANGELOG.md` → holdout once at the end.
Reject rules that fix only one example. Never edit labels to fit outputs; never tune on holdout.

## Reporting limits honestly
Self-authored data shares the author's blind spots; report n per class and confidence intervals are wide at n≈10. Say so.
