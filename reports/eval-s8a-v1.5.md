# Eval report — `s8a-v1.5` (tune split)

- Target: `http://localhost:3027` · `/health` mode `llm:groq` · version `0.1.0`
- Started 2026-10-11T19:19:40.385Z · 754.3 s · run id `261011191940`
- Dataset: 89 chunks, 12 sessions · 0 request/schema errors
- Replay: sessions in parallel (≤ 4), chunks sequential in timestamp order; rate limit: TPM 7000 (--tpm) / tokens per request 913 (--tokens-per-req) → 7 RPM → **7 RPM used as limit**. Provider free-tier limits are UNVERIFIED (not checked against provider docs in this run). · RPM achieved: 7.0

## Headline
| Metric | s8a-v1.5 | reference (placeholder) | Δ | constant-`neutral` floor |
| --- | --- | --- | --- | --- |
| Strict accuracy | 62.9% | 36.0% | +27.0 pp | 29.2% |
| Lenient accuracy | 79.8% | 51.7% | +28.1 pp | 43.8% |
| **Macro-F1** (headline) | 0.61 | 0.21 | +0.40 | 0.06 |
| Nuance subset strict | 61.3% | 0.0% | +61.3 pp |  |
| Nuance subset lenient | 64.5% | 9.7% | +54.8 pp |  |
| Volatility detection F1 (vs human labels) | 0.62 | 0.80 | -0.18 |  |
| Volatility fusion fidelity (agreement vs oracle) | 100.0% | 93.3% | +6.7 pp |  |
| Risk MAE (ordinal, lower is better) | 0.55 | 0.88 | -0.33 |  |
| Risk exact match | 57.3% | 42.7% | +14.6 pp |  |
| Client p50 ms (during eval, not a bench) | 308 | 1 | +307 |  |
| Client p95 ms | 463 | 6 | +457 |  |

Lenient = prediction ∈ `acceptable_sentiments`. Macro-F1 averages 7 classes (support or predictions > 0); undefined P/R count as 0.
Mean confidence: correct 0.69 · wrong 0.56.

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
| positive | 14 | 18 | 0.56 | 0.71 | 0.63 | 0.52 |
| negative | 13 | 15 | 0.53 | 0.62 | 0.57 | 0.00 |
| neutral | 26 | 32 | 0.53 | 0.65 | 0.59 | 0.49 |
| sarcastic | 8 | 1 | 1.00 | 0.13 | 0.22 | 0.00 |
| aggressive | 7 | 3 | 1.00 | 0.43 | 0.60 | 0.44 |
| deflecting | 9 | 10 | 0.70 | 0.78 | 0.74 | 0.00 |
| appeasement | 12 | 10 | 1.00 | 0.83 | 0.91 | 0.00 |

## Confusion matrix (rows = expected, cols = got)
| expected \ got | positive | negative | neutral | sarcastic | aggressive | deflecting | appeasement |
| --- | --- | --- | --- | --- | --- | --- | --- |
| positive | 10 | · | 4 | · | · | · | · |
| negative | · | 8 | 4 | · | · | 1 | · |
| neutral | 4 | 4 | 17 | · | · | 1 | · |
| sarcastic | 3 | 1 | 3 | 1 | · | · | · |
| aggressive | 1 | 2 | · | · | 3 | 1 | · |
| deflecting | · | · | 2 | · | · | 7 | · |
| appeasement | · | · | 2 | · | · | · | 10 |

## Nuance and slices
| Slice | n | strict | lenient |
| --- | --- | --- | --- |
| nuance subset | 31 | 61.3% | 64.5% |
| speaker: candidate | 47 | 61.7% | 78.7% |
| speaker: counterpart | 42 | 64.3% | 81.0% |
| acoustic:agree | 17 | 64.7% | 70.6% |
| acoustic:contradict | 8 | 25.0% | 37.5% |
| counterfactual | 8 | 50.0% | 62.5% |
| context-flip | 8 | 62.5% | 75.0% |
| context-dependent | 4 | 25.0% | 25.0% |
| hard-negative:* | 18 | 61.1% | 88.9% |
| injection | 3 | 100.0% | 100.0% |
| brief-pattern | 3 | 66.7% | 66.7% |
| sudden-shift | 5 | 60.0% | 60.0% |

Pairs (same text): 
| pair | kind | members (expected→got) | both strict-correct |
| --- | --- | --- | --- |
| ctx-brief | context-flip | s02_c02 deflecting→deflecting; s09_c04 sarcastic→neutral | no |
| ctx-sounds-great | context-flip | s03_c05 positive→positive; s03_c07 sarcastic→sarcastic | yes |
| cf-ultimatum | counterfactual | s04_c04 aggressive→aggressive; s05_c04 aggressive→aggressive | yes |
| ctx-take-back | context-flip | s06_c06 deflecting→deflecting; s09_c06 neutral→deflecting | no |
| ctx-appreciate | context-flip | s08_c07 positive→positive; s13_c04 sarcastic→positive | no |
| cf-march | counterfactual | s14_c02 positive→positive; s15_c02 sarcastic→positive | no |
| cf-number | counterfactual | s14_c04 neutral→neutral; s15_c04 negative→neutral | no |
| cf-concede | counterfactual | s14_c05 appeasement→neutral; s15_c05 appeasement→neutral | no |

## Volatility
- **Detection** (API `volatility_flag` vs human `expected_volatility`): P 0.50 · R 0.80 · F1 0.62 (TP 4, FP 4, FN 1; truth-positives 5/89; agreement 94.4%)
- **Fusion fidelity** (API flag vs ADR-003 oracle replayed over the *returned* sentiments + dataset acoustics, threshold 0.6 from fallback 0.6 (VOLATILITY_THRESHOLD not set in env); if the chunk before an errored request has no returned label, its expected label stands in): P 1.00 · R 1.00 · F1 1.00 (TP 8, FP 0, FN 0; truth-positives 8/89; agreement 100.0%)
- Detection mixes sentiment errors, formula limits and labeller noise; fidelity isolates the deterministic code.

## Risk
MAE 0.55 · exact 57.3% · signed bias -0.33 (> 0 = over-alerting) · n 89

## Provider mix
- Source: server log, 89/89 chunks matched. `/health` mode: `llm:groq`.
- Provider mix: `groq` 35 (39.3%), `heuristic` 54 (60.7%)
- Heuristic answers: 54 (60.7%) · fallback-LLM answers: 0 (0.0%)
- Outcomes: `ok` 35 (39.3%), `fallback` 54 (60.7%)
- Deadline timeouts: 32 (36.0%) · provider 429s: 1 (1.1%) · `finish_reason:length`: 0 (0.0%)

Accuracy by answering provider (from the server log):

| provider | n | strict | lenient |
| --- | --- | --- | --- |
| answered by `groq` | 35 | 74.3% | 97.1% |
| answered by `heuristic` | 54 | 55.6% | 68.5% |

## Latency observed during eval (not a benchmark — see bench report)
client p50 308 / p95 463 / max 483 ms · server `processing_latency_ms` p50 294 / p95 454 ms

## Failures (strict misses; lenient-ok marked)
| chunk | spk | expected [acceptable] | got | conf | risk exp→got | vol | tags | text |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| s01_c04 | cp | sarcastic [sarcastic/negative] | neutral | 0.40 | high→low (-2) | F→F | saas-renewal, acoustic:contradict, context-dependent, contradiction:text-pos/meaning-neg | Fifteen percent. Wow. That totally makes up for two outages. |
| s01_c06 | cp | aggressive [aggressive] | negative | 0.50 | critical→high (-1) | T→T | saas-renewal, acoustic:agree, sudden-shift, ultimatum | No. Either the service credits are in this renewal by Friday, or we... |
| s01_c07 | cand | neutral [neutral/positive] | positive (lenient ok) | 0.85 | medium→medium | F→F | saas-renewal, hard-negative:trade-not-appeasement | Understood. If you can commit to a 24-month term, I can include ser... |
| s02_c01 | cand | neutral [neutral] | positive | 0.90 | low→low | F→F | procurement, direct-ask | We've incorporated all of your redlines. Can we target signature by... |
| s02_c04 | cp | deflecting [deflecting] | neutral | 0.40 | high→low (-2) | F→F | procurement, acoustic:agree, deflection:process | Hard to say. There's a lot in the queue right now, and procurement ... |
| s02_c07 | cand | neutral [neutral/negative] | negative (lenient ok) | 0.90 | low→medium (+1) | F→F | procurement, hard-negative:polite-firmness | Just so we're aligned: the pricing hold runs until the 30th, and I'... |
| s03_c04 | cand | neutral [neutral/positive] | positive (lenient ok) | 0.85 | low→low | F→F | pricing, hard-negative:trade-not-appeasement | We can get to ninety-two if you move to annual billing upfront. |
| s03_c06 | cand | neutral [neutral/negative] | negative (lenient ok) | 0.90 | medium→medium | F→F | pricing, scope-creep | One more thing: the analytics module isn't included at that price. ... |
| s04_c02 | cp | negative [negative/aggressive/neutral] | neutral (lenient ok) | 0.90 | high→medium (-1) | F→F | competitor-bluff, mirror-prefix | Thanks. We've had another offer on the table at 39 per seat. |
| s04_c08 | cp | deflecting [deflecting] | neutral | 0.40 | high→low (-2) | F→F | competitor-bluff, deflection:vague | The details are confidential, but trust me, it's comparable. |
| s05_c02 | cp | negative [negative/aggressive/neutral] | neutral (lenient ok) | 0.90 | high→medium (-1) | F→F | competitor-bluff, mirror-prefix | Thanks. We've had another offer on the table at 39 per seat. |
| s06_c05 | cand | aggressive [aggressive/negative] | negative (lenient ok) | 0.50 | high→medium (-1) | F→F | deadline-pressure, blame | It's not an ultimatum, it's the reality of the quarter. Your team h... |
| s06_c07 | cand | sarcastic [sarcastic/aggressive] | neutral | 0.40 | high→low (-2) | F→F | deadline-pressure, acoustic:agree, contradiction:text-pos/meaning-neg | Of course. Because taking it back to your team has worked so well t... |
| s06_c08 | cp | negative [negative/deflecting] | deflecting (lenient ok) | 0.50 | high→medium (-1) | F→F | deadline-pressure | Your tone isn't helping. We'll pick this up next week. |
| s07_c01 | cand | neutral [neutral/positive] | positive (lenient ok) | 0.85 | low→low | F→F | saas-expansion | Based on your feedback, we've built a usage-based tier: you only pa... |
| s07_c04 | cp | positive [positive/neutral] | neutral (lenient ok) | 0.40 | low→low | F→F | saas-expansion, hard-negative:legal-approved | Legal approved it yesterday, so let's sign Friday. |
| s07_c05 | cand | positive [positive] | neutral | 0.40 | low→low | F→F | saas-expansion, hard-negative:on-board | Welcome on board. I'll send the onboarding schedule this afternoon. |
| s07_c06 | cp | neutral [neutral/positive] | negative | 0.50 | low→medium (+1) | F→F | saas-expansion, hard-negative:never-know | You never know with data migrations, so let's keep a two-week buffe... |
| s08_c05 | cand | sarcastic [sarcastic/negative] | positive | 0.43 | high→low (-2) | F→T | scope-delivery, acoustic:contradict, contradiction:text-pos/meaning-neg | Hopeful. Great. That's what I heard in April too. |
| s08_c09 | cp | positive [positive/neutral] | neutral (lenient ok) | 0.40 | low→low | F→F | scope-delivery, hard-negative:concrete-date | Yes. Our lead engineer, Priya, will send a written go-live date by ... |
| s09_c01 | cand | neutral [neutral/appeasement] | negative | 0.50 | low→medium (+1) | F→F | legal | Before we sign, I want to acknowledge the auto-renewal clause issue... |
| s09_c02 | cp | negative [negative] | neutral | 0.40 | medium→low (-1) | F→F | legal | That clause cost us forty thousand. It was buried on page nineteen. |
| s09_c04 | cp | sarcastic [sarcastic/negative/deflecting] | neutral | 0.40 | high→low (-2) | F→F | legal, brief-pattern, context-flip, context-dependent, acoustic:contradict, contradiction:text-pos/meaning-neg | Oh, we're one hundred percent behind this deal. Of course, our coun... |
| s09_c05 | cand | positive [positive/neutral] | neutral (lenient ok) | 0.40 | low→low | F→F | legal | That's completely fair. We'll send a clean redline with a change su... |
| s09_c06 | cp | neutral [neutral/deflecting] | deflecting (lenient ok) | 0.50 | low→medium (+1) | F→F | legal, context-flip | Let me take that back to my team. |
| s13_c02 | cand | sarcastic [sarcastic/negative] | negative (lenient ok) | 0.92 | high→medium (-1) | F→F | sla, acoustic:agree, baseline:fast-talker-calm | Fifty-two. Right. And I suppose the standard SLA is the one that ga... |
| s13_c04 | cand | sarcastic [sarcastic] | positive | 0.50 | high→low (-2) | F→F | sla, context-flip, context-dependent, contradiction:text-pos/meaning-neg | I appreciate you being so flexible. |
| s13_c05 | cand | aggressive [aggressive] | deflecting | 0.50 | critical→medium (-2) | T→T | sla, ultimatum, sudden-shift, acoustic:agree | Down the line does not work for me. Either the SLA has teeth by Mon... |
| s13_c07 | cand | aggressive [aggressive/negative] | positive | 0.50 | high→low (-2) | F→T | sla, blame, cold-aggression, acoustic:contradict, contradiction:harsh-words/flat-delivery | Good. And frankly, the fact that it took a threat to get there tell... |
| s14_c05 | cand | appeasement [appeasement] | neutral | 0.40 | high→low (-2) | F→F | timeline, counterfactual, concession-on-price | Okay, I think we can probably do something on that fee. |
| s15_c02 | cp | sarcastic [sarcastic/negative] | positive | 0.50 | medium→low (-1) | F→F | timeline, counterfactual, acoustic:contradict, contradiction:text-pos/meaning-neg | Oh, March. Okay, great. |
| s15_c04 | cp | negative [negative/sarcastic/neutral] | neutral (lenient ok) | 0.40 | medium→low (-1) | F→T | timeline, pricing, counterfactual, acoustic:contradict | That's an interesting number. |
| s15_c05 | cand | appeasement [appeasement] | neutral | 0.40 | high→low (-2) | F→F | timeline, counterfactual, acoustic:agree, concession-on-price | Okay, I think we can probably do something on that fee. |

## Limits
Single labeller, self-authored data (shares the author's blind spots). Per-class n is small (see Coverage).
95% Wilson intervals: strict 62.9% [52.5%, 72.2%] (n 89) · lenient 79.8% [70.3%, 86.8%] (n 89) · nuance strict 61.3% [43.8%, 76.3%] (n 31).
