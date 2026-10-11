# Eval report — `ours` (smoke subset (tune))

- Target: `http://localhost:3027` · `/health` mode `heuristic` · version `0.1.0`
- Started 2026-10-11T13:35:20.536Z · 0.0 s · run id `261011133520`
- Dataset: 15 chunks, 2 sessions · 0 request/schema errors
- Replay: sessions in parallel (≤ 4), chunks sequential in timestamp order; rate limit: mode `heuristic` (no LLM): unthrottled; no token budget applied · RPM achieved: n/a (unthrottled)
- **Smoke gate:** lenient accuracy 60.0% vs threshold 60.0% → **PASS** (constant-`neutral` lenient floor 40.0%). Smoke numbers are a regression tripwire, never a quality claim.

## Headline
| Metric | ours | reference (placeholder) | Δ | constant-`neutral` floor |
| --- | --- | --- | --- | --- |
| Strict accuracy | 53.3% | 40.0% | +13.3 pp | 33.3% |
| Lenient accuracy | 60.0% | 53.3% | +6.7 pp | 40.0% |
| **Macro-F1** (headline) | 0.31 | 0.28 | +0.03 | 0.07 |
| Nuance subset strict | 33.3% | 0.0% | +33.3 pp |  |
| Nuance subset lenient | 33.3% | 16.7% | +16.7 pp |  |
| Volatility detection F1 (vs human labels) | 0.00 | 1.00 | -1.00 |  |
| Volatility fusion fidelity (agreement vs oracle) | 86.7% | 93.3% | -6.7 pp |  |
| Risk MAE (ordinal, lower is better) | 0.73 | 0.87 | -0.13 |  |
| Risk exact match | 53.3% | 46.7% | +6.7 pp |  |
| Client p50 ms (during eval, not a bench) | 1 | 2 | -1 |  |
| Client p95 ms | 5 | 11 | -6 |  |

Lenient = prediction ∈ `acceptable_sentiments`. Macro-F1 averages 7 classes (support or predictions > 0); undefined P/R count as 0.
Mean confidence: correct 0.46 · wrong 0.43.

## Coverage (this run)
| expected | candidate | counterpart | total |
| --- | --- | --- | --- |
| positive | 0 | 2 | 2 |
| negative | 0 | 1 | 1 |
| neutral | 5 | 0 | 5 |
| sarcastic | 0 | 1 | 1 |
| aggressive | 0 | 1 | 1 |
| deflecting | 1 | 2 | 3 |
| appeasement | 2 | 0 | 2 |

## Per-class
| Class | support | predicted | P | R | F1 | reference (placeholder) F1 |
| --- | --- | --- | --- | --- | --- | --- |
| positive | 2 | 3 | 0.67 | 1.00 | 0.80 | 0.50 |
| negative | 1 | 1 | 0.00 | 0.00 | 0.00 | 0.00 |
| neutral | 5 | 9 | 0.44 | 0.80 | 0.57 | 0.47 |
| sarcastic | 1 | 0 | 0.00 | 0.00 | 0.00 | 0.00 |
| aggressive | 1 | 0 | 0.00 | 0.00 | 0.00 | 1.00 |
| deflecting | 3 | 2 | 1.00 | 0.67 | 0.80 | 0.00 |
| appeasement | 2 | 0 | 0.00 | 0.00 | 0.00 | 0.00 |

## Confusion matrix (rows = expected, cols = got)
| expected \ got | positive | negative | neutral | sarcastic | aggressive | deflecting | appeasement |
| --- | --- | --- | --- | --- | --- | --- | --- |
| positive | 2 | · | · | · | · | · | · |
| negative | · | · | 1 | · | · | · | · |
| neutral | 1 | · | 4 | · | · | · | · |
| sarcastic | · | · | 1 | · | · | · | · |
| aggressive | · | 1 | · | · | · | · | · |
| deflecting | · | · | 1 | · | · | 2 | · |
| appeasement | · | · | 2 | · | · | · | · |

## Nuance and slices
| Slice | n | strict | lenient |
| --- | --- | --- | --- |
| nuance subset | 6 | 33.3% | 33.3% |
| speaker: candidate | 8 | 62.5% | 75.0% |
| speaker: counterpart | 7 | 42.9% | 42.9% |
| acoustic:agree | 4 | 25.0% | 25.0% |
| acoustic:contradict | 2 | 0.0% | 0.0% |
| context-flip | 1 | 0.0% | 0.0% |
| context-dependent | 1 | 0.0% | 0.0% |
| hard-negative:* | 3 | 100.0% | 100.0% |
| brief-pattern | 2 | 0.0% | 0.0% |
| sudden-shift | 1 | 0.0% | 0.0% |

Pairs (same text): 
| pair | kind | members (expected→got) | both strict-correct |
| --- | --- | --- | --- |
| ctx-brief | context-flip | s02_c02 deflecting→neutral | no |

## Volatility
- **Detection** (API `volatility_flag` vs human `expected_volatility`): P 0.00 · R 0.00 · F1 0.00 (TP 0, FP 0, FN 1; truth-positives 1/15; agreement 93.3%)
- **Fusion fidelity** (API flag vs ADR-003 oracle replayed over the *returned* sentiments + dataset acoustics, threshold 0.6 from fallback 0.6 (VOLATILITY_THRESHOLD not set in env); if the chunk before an errored request has no returned label, its expected label stands in): P 0.00 · R 0.00 · F1 0.00 (TP 0, FP 0, FN 2; truth-positives 2/15; agreement 86.7%)
- Detection mixes sentiment errors, formula limits and labeller noise; fidelity isolates the deterministic code.

## Risk
MAE 0.73 · exact 53.3% · signed bias -0.73 (> 0 = over-alerting) · n 15

## Provider mix
- Source: server log, 15/15 chunks matched. `/health` mode: `heuristic`.
- Provider mix: `heuristic` 15 (100.0%)
- Heuristic answers: 15 (100.0%) · fallback-LLM answers: n/a (no LLM primary in /health mode)
- Outcomes: `ok` 15 (100.0%)
- Deadline timeouts: not logged by backend (`reason` field absent) · provider 429s: not logged by backend (`reason` field absent) · `finish_reason:length`: not logged by backend (`finish_reason` field absent)

## Latency observed during eval (not a benchmark — see bench report)
client p50 1 / p95 5 / max 5 ms · server `processing_latency_ms` p50 0 / p95 0 ms

## Failures (strict misses; lenient-ok marked)
| chunk | spk | expected [acceptable] | got | conf | risk exp→got | vol | tags | text |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| s01_c01 | cand | neutral [neutral/positive] | positive (lenient ok) | 0.50 | low→low | F→F | saas-renewal | Thanks for making time today. I sent over the renewal quote: 120 se... |
| s01_c02 | cp | negative [negative] | neutral | 0.40 | medium→low (-1) | F→F | saas-renewal, baseline:fast-talker-calm | Honestly, the last two quarters were rough for us. We had two outag... |
| s01_c03 | cand | appeasement [appeasement] | neutral | 0.40 | high→low (-2) | F→F | saas-renewal, acoustic:agree, concession-on-price | I'm really sorry about that, that's completely on us. We could knoc... |
| s01_c04 | cp | sarcastic [sarcastic/negative] | neutral | 0.40 | high→low (-2) | F→F | saas-renewal, acoustic:contradict, context-dependent, contradiction:text-pos/meaning-neg | Fifteen percent. Wow. That totally makes up for two outages. |
| s01_c06 | cp | aggressive [aggressive] | negative | 0.50 | critical→high (-1) | T→F | saas-renewal, acoustic:agree, sudden-shift, ultimatum | No. Either the service credits are in this renewal by Friday, or we... |
| s02_c02 | cp | deflecting [deflecting] | neutral | 0.40 | high→low (-2) | F→F | procurement, brief-pattern, context-flip, acoustic:contradict, contradiction:text-pos/meaning-avoid, deflection:legal | Oh, we're one hundred percent behind this deal. Of course, our coun... |
| s02_c05 | cand | appeasement [appeasement] | neutral | 0.40 | high→low (-2) | F→F | procurement, brief-pattern, acoustic:agree, concession-on-price | Of course, we're just as committed, and your counsel should take al... |

## Limits
Single labeller, self-authored data (shares the author's blind spots). Per-class n is small (see Coverage).
95% Wilson intervals: strict 53.3% [30.1%, 75.2%] (n 15) · lenient 60.0% [35.7%, 80.2%] (n 15) · nuance strict 33.3% [9.7%, 70.0%] (n 6).
