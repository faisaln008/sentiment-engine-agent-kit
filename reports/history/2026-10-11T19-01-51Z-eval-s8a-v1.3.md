# Eval report — `s8a-v1.3` (tune split)

- Target: `http://localhost:3027` · `/health` mode `llm:groq` · version `0.1.0`
- Started 2026-10-11T18:49:16.561Z · 754.8 s · run id `261011184916`
- Dataset: 89 chunks, 12 sessions · 0 request/schema errors
- Replay: sessions in parallel (≤ 4), chunks sequential in timestamp order; rate limit: TPM 7000 (--tpm) / tokens per request 913 (--tokens-per-req) → 7 RPM → **7 RPM used as limit**. Provider free-tier limits are UNVERIFIED (not checked against provider docs in this run). · RPM achieved: 7.0

## Headline
| Metric | s8a-v1.3 | reference (placeholder) | Δ | constant-`neutral` floor |
| --- | --- | --- | --- | --- |
| Strict accuracy | 77.5% | 36.0% | +41.6 pp | 29.2% |
| Lenient accuracy | 95.5% | 51.7% | +43.8 pp | 43.8% |
| **Macro-F1** (headline) | 0.77 | 0.21 | +0.56 | 0.06 |
| Nuance subset strict | 83.9% | 0.0% | +83.9 pp |  |
| Nuance subset lenient | 96.8% | 9.7% | +87.1 pp |  |
| Volatility detection F1 (vs human labels) | 0.73 | 0.80 | -0.07 |  |
| Volatility fusion fidelity (agreement vs oracle) | 100.0% | 93.3% | +6.7 pp |  |
| Risk MAE (ordinal, lower is better) | 0.36 | 0.88 | -0.52 |  |
| Risk exact match | 67.4% | 42.7% | +24.7 pp |  |
| Client p50 ms (during eval, not a bench) | 243 | 1 | +242 |  |
| Client p95 ms | 392 | 6 | +386 |  |

Lenient = prediction ∈ `acceptable_sentiments`. Macro-F1 averages 7 classes (support or predictions > 0); undefined P/R count as 0.
Mean confidence: correct 0.91 · wrong 0.86.

## Coverage (this run)
| expected | candidate | counterpart | total |
| --- | --- | --- | --- |
| positive | 5 | 9 | 14 |
| negative | 5 | 8 | 13 |
| neutral | 19 | 7 | 26 |
| sarcastic | 4 | 4 | 8 |
| aggressive | 4 | 3 | 7 |
| deflecting | 2 | 7 | 9 |
| appeasement | 8 | 4 | 12 |

## Per-class
| Class | support | predicted | P | R | F1 | reference (placeholder) F1 |
| --- | --- | --- | --- | --- | --- | --- |
| positive | 14 | 18 | 0.72 | 0.93 | 0.81 | 0.52 |
| negative | 13 | 15 | 0.60 | 0.69 | 0.64 | 0.00 |
| neutral | 26 | 20 | 0.85 | 0.65 | 0.74 | 0.49 |
| sarcastic | 8 | 4 | 0.75 | 0.38 | 0.50 | 0.00 |
| aggressive | 7 | 7 | 0.86 | 0.86 | 0.86 | 0.44 |
| deflecting | 9 | 13 | 0.69 | 1.00 | 0.82 | 0.00 |
| appeasement | 12 | 12 | 1.00 | 1.00 | 1.00 | 0.00 |

## Confusion matrix (rows = expected, cols = got)
| expected \ got | positive | negative | neutral | sarcastic | aggressive | deflecting | appeasement |
| --- | --- | --- | --- | --- | --- | --- | --- |
| positive | 13 | · | 1 | · | · | · | · |
| negative | · | 9 | 2 | 1 | · | 1 | · |
| neutral | 4 | 3 | 17 | · | · | 2 | · |
| sarcastic | 1 | 2 | · | 3 | 1 | 1 | · |
| aggressive | · | 1 | · | · | 6 | · | · |
| deflecting | · | · | · | · | · | 9 | · |
| appeasement | · | · | · | · | · | · | 12 |

## Nuance and slices
| Slice | n | strict | lenient |
| --- | --- | --- | --- |
| nuance subset | 31 | 83.9% | 96.8% |
| speaker: candidate | 47 | 76.6% | 95.7% |
| speaker: counterpart | 42 | 78.6% | 95.2% |
| acoustic:agree | 17 | 82.4% | 94.1% |
| acoustic:contradict | 8 | 62.5% | 100.0% |
| counterfactual | 8 | 75.0% | 100.0% |
| context-flip | 8 | 62.5% | 87.5% |
| context-dependent | 4 | 50.0% | 75.0% |
| hard-negative:* | 18 | 83.3% | 100.0% |
| injection | 3 | 100.0% | 100.0% |
| brief-pattern | 3 | 66.7% | 100.0% |
| sudden-shift | 5 | 60.0% | 60.0% |

Pairs (same text): 
| pair | kind | members (expected→got) | both strict-correct |
| --- | --- | --- | --- |
| ctx-brief | context-flip | s02_c02 deflecting→deflecting; s09_c04 sarcastic→deflecting | no |
| ctx-sounds-great | context-flip | s03_c05 positive→positive; s03_c07 sarcastic→positive | no |
| cf-ultimatum | counterfactual | s04_c04 aggressive→aggressive; s05_c04 aggressive→aggressive | yes |
| ctx-take-back | context-flip | s06_c06 deflecting→deflecting; s09_c06 neutral→deflecting | no |
| ctx-appreciate | context-flip | s08_c07 positive→positive; s13_c04 sarcastic→sarcastic | yes |
| cf-march | counterfactual | s14_c02 positive→positive; s15_c02 sarcastic→sarcastic | yes |
| cf-number | counterfactual | s14_c04 neutral→deflecting; s15_c04 negative→sarcastic | no |
| cf-concede | counterfactual | s14_c05 appeasement→appeasement; s15_c05 appeasement→appeasement | yes |

## Volatility
- **Detection** (API `volatility_flag` vs human `expected_volatility`): P 0.67 · R 0.80 · F1 0.73 (TP 4, FP 2, FN 1; truth-positives 5/89; agreement 96.6%)
- **Fusion fidelity** (API flag vs ADR-003 oracle replayed over the *returned* sentiments + dataset acoustics, threshold 0.6 from fallback 0.6 (VOLATILITY_THRESHOLD not set in env); if the chunk before an errored request has no returned label, its expected label stands in): P 1.00 · R 1.00 · F1 1.00 (TP 6, FP 0, FN 0; truth-positives 6/89; agreement 100.0%)
- Detection mixes sentiment errors, formula limits and labeller noise; fidelity isolates the deterministic code.

## Risk
MAE 0.36 · exact 67.4% · signed bias 0.02 (> 0 = over-alerting) · n 89

## Provider mix
- Source: server log, 89/89 chunks matched. `/health` mode: `llm:groq`.
- Provider mix: `groq` 86 (96.6%), `heuristic` 3 (3.4%)
- Heuristic answers: 3 (3.4%) · fallback-LLM answers: 0 (0.0%)
- Outcomes: `ok` 86 (96.6%), `fallback` 3 (3.4%)
- Deadline timeouts: 3 (3.4%) · provider 429s: 0 (0.0%) · `finish_reason:length`: 0 (0.0%)

Accuracy by answering provider (from the server log):

| provider | n | strict | lenient |
| --- | --- | --- | --- |
| answered by `groq` | 86 | 77.9% | 96.5% |
| answered by `heuristic` | 3 | 66.7% | 66.7% |

## Latency observed during eval (not a benchmark — see bench report)
client p50 243 / p95 392 / max 488 ms · server `processing_latency_ms` p50 237 / p95 379 ms

## Failures (strict misses; lenient-ok marked)
| chunk | spk | expected [acceptable] | got | conf | risk exp→got | vol | tags | text |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| s01_c06 | cp | aggressive [aggressive] | negative | 0.50 | critical→high (-1) | T→T | saas-renewal, acoustic:agree, sudden-shift, ultimatum | No. Either the service credits are in this renewal by Friday, or we... |
| s01_c07 | cand | neutral [neutral/positive] | positive (lenient ok) | 0.85 | medium→medium | F→F | saas-renewal, hard-negative:trade-not-appeasement | Understood. If you can commit to a 24-month term, I can include ser... |
| s02_c01 | cand | neutral [neutral] | positive | 0.90 | low→low | F→F | procurement, direct-ask | We've incorporated all of your redlines. Can we target signature by... |
| s02_c07 | cand | neutral [neutral/negative] | negative (lenient ok) | 0.90 | low→medium (+1) | F→F | procurement, hard-negative:polite-firmness | Just so we're aligned: the pricing hold runs until the 30th, and I'... |
| s03_c04 | cand | neutral [neutral/positive] | positive (lenient ok) | 0.85 | low→low | F→F | pricing, hard-negative:trade-not-appeasement | We can get to ninety-two if you move to annual billing upfront. |
| s03_c06 | cand | neutral [neutral/negative] | negative (lenient ok) | 0.90 | medium→medium | F→F | pricing, scope-creep | One more thing: the analytics module isn't included at that price. ... |
| s03_c07 | cp | sarcastic [sarcastic/negative] | positive | 0.85 | high→low (-2) | T→F | pricing, context-flip, context-dependent, contradiction:text-pos/meaning-neg, sudden-shift | Sounds great. |
| s04_c02 | cp | negative [negative/aggressive/neutral] | neutral (lenient ok) | 0.90 | high→medium (-1) | F→F | competitor-bluff, mirror-prefix | Thanks. We've had another offer on the table at 39 per seat. |
| s05_c02 | cp | negative [negative/aggressive/neutral] | neutral (lenient ok) | 0.90 | high→medium (-1) | F→F | competitor-bluff, mirror-prefix | Thanks. We've had another offer on the table at 39 per seat. |
| s06_c07 | cand | sarcastic [sarcastic/aggressive] | aggressive (lenient ok) | 0.95 | high→critical (+1) | F→F | deadline-pressure, acoustic:agree, contradiction:text-pos/meaning-neg | Of course. Because taking it back to your team has worked so well t... |
| s06_c08 | cp | negative [negative/deflecting] | deflecting (lenient ok) | 0.90 | high→medium (-1) | F→F | deadline-pressure | Your tone isn't helping. We'll pick this up next week. |
| s07_c01 | cand | neutral [neutral/positive] | positive (lenient ok) | 0.85 | low→low | F→F | saas-expansion | Based on your feedback, we've built a usage-based tier: you only pa... |
| s08_c05 | cand | sarcastic [sarcastic/negative] | negative (lenient ok) | 0.92 | high→medium (-1) | F→F | scope-delivery, acoustic:contradict, contradiction:text-pos/meaning-neg | Hopeful. Great. That's what I heard in April too. |
| s09_c01 | cand | neutral [neutral/appeasement] | negative | 0.85 | low→medium (+1) | F→F | legal | Before we sign, I want to acknowledge the auto-renewal clause issue... |
| s09_c04 | cp | sarcastic [sarcastic/negative/deflecting] | deflecting (lenient ok) | 0.85 | high→medium (-1) | F→F | legal, brief-pattern, context-flip, context-dependent, acoustic:contradict, contradiction:text-pos/meaning-neg | Oh, we're one hundred percent behind this deal. Of course, our coun... |
| s09_c05 | cand | positive [positive/neutral] | neutral (lenient ok) | 0.90 | low→low | F→F | legal | That's completely fair. We'll send a clean redline with a change su... |
| s09_c06 | cp | neutral [neutral/deflecting] | deflecting (lenient ok) | 0.90 | low→medium (+1) | F→F | legal, context-flip | Let me take that back to my team. |
| s13_c02 | cand | sarcastic [sarcastic/negative] | negative (lenient ok) | 0.90 | high→medium (-1) | F→F | sla, acoustic:agree, baseline:fast-talker-calm | Fifty-two. Right. And I suppose the standard SLA is the one that ga... |
| s14_c04 | cp | neutral [neutral/deflecting/negative] | deflecting (lenient ok) | 0.75 | medium→medium | F→F | timeline, pricing, counterfactual | That's an interesting number. |
| s15_c04 | cp | negative [negative/sarcastic/neutral] | sarcastic (lenient ok) | 0.85 | medium→medium | F→F | timeline, pricing, counterfactual, acoustic:contradict | That's an interesting number. |

## Limits
Single labeller, self-authored data (shares the author's blind spots). Per-class n is small (see Coverage).
95% Wilson intervals: strict 77.5% [67.8%, 85.0%] (n 89) · lenient 95.5% [89.0%, 98.2%] (n 89) · nuance strict 83.9% [67.4%, 92.9%] (n 31).
