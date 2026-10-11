# docs-writer claims — finalize pass 2026-10-11

Every numeric claim in the four root docs with its source file.

| Claim | Value | Source |
| --- | --- | --- |
| LLM tune macro-F1 (v1.3) | 0.77 | reports/eval-s8a-v1.3.md |
| LLM strict / lenient accuracy (v1.3) | 77.5% / 95.5% | reports/eval-s8a-v1.3.md |
| Nuance subset strict / lenient (v1.3) | 83.9% / 96.8% | reports/eval-s8a-v1.3.md |
| Risk MAE / exact match (v1.3) | 0.36 / 67.4% | reports/eval-s8a-v1.3.md |
| Volatility detection F1 (v1.3) | 0.73 | reports/eval-s8a-v1.3.md |
| Volatility fusion fidelity (v1.3) | 100.0% | reports/eval-s8a-v1.3.md |
| Per-class F1 positive/negative/neutral/sarcastic/aggressive/deflecting/appeasement (v1.3) | 0.81/0.64/0.74/0.50/0.86/0.82/1.00 | reports/eval-s8a-v1.3.md |
| Provider mix in v1.3 eval | Groq 86 (96.6%), heuristic 3 (3.4%), Gemini 0, 429s 0 | reports/eval-s8a-v1.3.md |
| Sarcasm recall | 3/8 | reports/eval-s8a-v1.3.md |
| neutral→positive misses | 4 | reports/eval-s8a-v1.3.md |
| Context-flip pairs strict-correct | 1/4 | reports/eval-s8a-v1.3.md |
| Counterfactual pairs strict-correct | 3/4 | reports/eval-s8a-v1.3.md |
| Sudden-shift strict | 60% (n 5) | reports/eval-s8a-v1.3.md |
| acoustic:contradict strict / lenient | 62.5% / 100% | reports/eval-s8a-v1.3.md |
| Mean confidence correct / wrong | 0.91 / 0.86 | reports/eval-s8a-v1.3.md |
| Wilson 95% CI strict | [67.8%, 85.0%] | reports/eval-s8a-v1.3.md |
| Client latency p50 / p95, LLM eval-observed (v1.3, throttled) | 243 / 392 ms | reports/eval-s8a-v1.3.md |
| Client latency p50 / p95, LLM bench --quick (v1.1, no context) | 249 / 453 ms | reports/ab-cp1.md |
| Reference backend macro-F1 | 0.21 | reports/eval-reference.md |
| Reference strict / lenient | 36.0% / 51.7% | reports/eval-reference.md |
| Reference nuance strict / lenient | 0.0% / 9.7% | reports/eval-reference.md |
| Reference risk MAE / exact | 0.88 / 42.7% | reports/eval-reference.md |
| Reference vol F1 | 0.80 | reports/eval-reference.md |
| Reference fidelity | 93.3% | reports/eval-reference.md |
| Heuristic macro-F1 | 0.52 | reports/eval-latest.md |
| Heuristic strict / lenient | 59.6% / 69.7% | reports/eval-latest.md |
| Heuristic nuance strict / lenient | 45.2% / 45.2% | reports/eval-latest.md |
| Heuristic risk MAE / exact | 0.70 / 51.7% | reports/eval-latest.md |
| Heuristic vol F1 | 0.57 | reports/eval-latest.md |
| Heuristic sarcastic F1 | 0.00 | reports/eval-latest.md |
| Heuristic aggressive recall | 0.29 | reports/eval-latest.md |
| Heuristic bench p50 / p95 / p99 | 1 / 10 / 13 ms | reports/bench-latest.md |
| Heuristic bench n | 400 | reports/bench-latest.md |
| eval:smoke threshold | 9/15 lenient correct | .agent-work/reviews/S4b-r2.md |
| Heuristic holdout strict (non-official) | 46.4% | .agent-work/reviews/S4b-r2.md |
| v1.4 macro-F1 | 0.73 | reports/PROMPT_CHANGELOG.md, reports/eval-s8a-v1.4.md |
| v1.5 macro-F1 (invalid run) | 0.61 | reports/PROMPT_CHANGELOG.md, reports/eval-s8a-v1.5.md |
| v1.4 trim: 257 chars / 51 tokens cut | 257 chars, 51 tokens | reports/PROMPT_CHANGELOG.md |
| v1.4 heuristic answers (timeouts) | 13 | reports/PROMPT_CHANGELOG.md |
| v1.5 TPD 429s | 6 (+ 21 circuit-open) | reports/PROMPT_CHANGELOG.md |
| v1.5 heuristic answers | 54/89 | reports/eval-s8a-v1.5.md |
| Groq org limit | 8000 TPM | specs/adr/005-provider-amendment-cp1.md |
| Gemini p50 / p95 warm | 681 / 852 ms (12 calls) | .agent-work/handoff/backend-dev-S4a.md |
| Gemini per-call range (8 calls) | 580–1170 ms | specs/adr/005-provider-amendment-cp1.md |
| Default LLM_DEADLINE_MS | 450 ms | .env.example |
| Default LLM_MAX_TOKENS | 90 | .env.example |
| Default LLM_MAX_INFLIGHT | 16 | .env.example |
| Circuit breaker: 3 failures / 15 s cooldown | 3 / 15 s | .env.example, specs/adr/001-provider-strategy.md |
| Max sessions / TTL | 1000 / 30 min | .env.example |
| WS max clients | 50 | .env.example |
| Context turns | 3 | .env.example |
| Dataset total / tune / holdout | 117 / 89 / 28 chunks | apps/backend/eval/datasets/ (wc -l) |
| Dataset sessions tune / holdout | 12 / 3 | reports/eval-s8a-v1.3.md |
| Prompt tokens no-context / 3-turns (v1.3) | 793 / 913 | reports/PROMPT_CHANGELOG.md |
| System tokens v1.3 (inferred) | ≈752 | reports/PROMPT_CHANGELOG.md (by difference) |
| Tests passed | 245 in 27 files | .agent-work/reviews/S8a-r1.md |
| Security audit: 1 high r1 (resolved), r2 0 critical 0 high | as stated | .agent-work/security/audit-r2.md |
| Memory worst-case 1000 sessions | 1.10 GB | .agent-work/security/audit-r2.md |
| Reviews: 27 files, 16 first-round, 12 REQUEST_CHANGES / 4 APPROVE | as stated | .agent-work/reviews/ (counted) |
| gpt-oss-20b heuristic rate in eval | 85.4% | reports/ab-cp1.md |
| ai-log entry count | 27 entries | .agent-work/ai-log.md (counted; 27th entry is the docs-writer correction line) |
