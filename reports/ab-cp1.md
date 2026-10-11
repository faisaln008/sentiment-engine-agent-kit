# CP1 model A/B (S3c)

Generated 2026-10-11T18:32:51.811Z from committed evidence only (eval raw stores, sanitised server logs, bench reports under `reports/raw/`). Reproduce:

```
npx tsx apps/backend/eval/ab-compare.ts --arm 'qwen|ab-qwen|reports/raw/serverlog-ab-qwen.jsonl|reports/raw/bench-ab-qwen.md|qwen/qwen3.8-27b, effort none' --arm 'gptoss|ab-gptoss|reports/raw/serverlog-ab-gptoss.jsonl|reports/raw/bench-ab-gptoss.md|openai/gpt-oss-20b, effort low' --extra 'gptoss-r2|reports/raw/serverlog-ab-gptoss-r2.jsonl|reports/raw/bench-ab-gptoss-r2.md|openai/gpt-oss-20b, effort low, 6 RPM re-run' --notes reports/raw/ab-cp1-notes.md
```

Per-arm eval reports: `reports/eval-ab-qwen.md`, `reports/eval-ab-gptoss.md`.

## Primary result (LLM_DEADLINE_MS 450 as set for each arm server; see the timeout latency row)
|  | **qwen** | **gptoss** |
| --- | --- | --- |
| Config | qwen/qwen3.8-27b, effort none | openai/gpt-oss-20b, effort low |
| Eval n (tune) | 89 | 89 |
| Eval macro-F1 (classes averaged) | 0.75 (7) | 0.33 (7) |
| Eval strict / lenient | 76.4% / 87.6% | 47.2% / 53.9% |
| Nuance subset strict / lenient (n) | 80.6% / 87.1% (31) | 16.1% / 19.4% (31) |
| **LLM-answered** n | 82 | 13 |
| **LLM-answered macro-F1** (classes averaged) | 0.81 (7) | 0.47 (5) |
| LLM-answered strict / lenient | 80.5% / 92.7% | 61.5% / 61.5% |
| LLM-answered nuance strict / lenient (n) | 83.3% / 90.0% (30) | 0.0% / 0.0% (3) |
| Eval heuristic answers | 7/89 (7.9%) | 76/89 (85.4%) |
| Eval fallback reasons (all) | timeout 7 | bad_json 33, timeout 43 |
| Eval deadline timeouts | 7/89 (7.9%) | 43/89 (48.3%) |
| Eval `finish_reason:length` | 0/89 (0.0%) (logged only when the LLM answer was used; `bad_json` truncations not counted) | 2/89 (2.2%) (logged only when the LLM answer was used; `bad_json` truncations not counted) |
| Eval provider 429s | 0/89 (0.0%) | 0/89 (0.0%) |
| Eval-observed client p50 / p95 ms (throttled eval, NOT a bench) | 250 / 465 (n 89) | 451 / 460 (n 89) |
| Bench quick client p50 / p95 / p99 ms | 249 / 453 / 478 (n 50); server-side median 241 ms, 95% bootstrap CI [223, 248] (n 50; dispersion only: the budget is client-side, which adds loopback/HTTP time) | 400 / 461 / 469 (n 50) — **INVALID (provider 429)** |
| Bench heuristic answers | 2/50 (4.0%) | 39/50 (78.0%) |
| Bench fallback reasons (all) | timeout 2 | timeout 16, bad_json 18, rate_limited 5 |
| Bench deadline timeouts | 2/50 (4.0%) | 16/50 (32.0%) |
| Bench `finish_reason:length` | 0/50 (0.0%) (logged only when the LLM answer was used; `bad_json` truncations not counted) | 1/50 (2.0%) (logged only when the LLM answer was used; `bad_json` truncations not counted) |
| Bench provider 429s | 0/50 (0.0%) | 5/50 (10.0%) |
| Server latency_ms of deadline timeouts (min–max) | 452–463 (n 9) | 450–454 (n 59) |

Rule (TASKS S3c: highest macro-F1 among arms with bench p50 < 250 ms; author's validity rule: no provider 429 in the bench): **qwen** (macro-F1 0.75; p50 249 ms = 1 ms under budget, n 50).

## Per-class F1 (tune, all chunks)
| Class | qwen F1 (support) | gptoss F1 (support) |
| --- | --- | --- |
| positive | 0.72 (n 14) | 0.47 (n 14) |
| negative | 0.72 (n 13) | 0.58 (n 13) |
| neutral | 0.74 (n 26) | 0.60 (n 26) |
| sarcastic | 0.50 (n 8) | 0.00 (n 8) |
| aggressive | 0.77 (n 7) | 0.00 (n 7) |
| deflecting | 0.82 (n 9) | 0.40 (n 9) |
| appeasement | 1.00 (n 12) | 0.29 (n 12) |
| classes in macro-F1 | 7 | 7 |

## Per-class F1 (LLM-answered chunks only; support differs per arm)
| Class | qwen F1 (support) | gptoss F1 (support) |
| --- | --- | --- |
| positive | 0.76 (n 13) | 0.62 (n 4) |
| negative | 0.75 (n 12) | 1.00 (n 1) |
| neutral | 0.75 (n 23) | 0.75 (n 5) |
| sarcastic | 0.55 (n 8) | — (n 0) |
| aggressive | 1.00 (n 5) | — (n 0) |
| deflecting | 0.86 (n 9) | 0.00 (n 1) |
| appeasement | 1.00 (n 12) | 0.00 (n 2) |
| classes in macro-F1 | 7 | 5 |

## Extra bench-only runs (re-runs / variants; see notes)
|  | **gptoss-r2** |
| --- | --- |
| Config | openai/gpt-oss-20b, effort low, 6 RPM re-run |
| Eval n (tune) | — |
| Eval macro-F1 (classes averaged) | — |
| Eval strict / lenient | — |
| Nuance subset strict / lenient (n) | — |
| **LLM-answered** n | — |
| **LLM-answered macro-F1** (classes averaged) | — |
| LLM-answered strict / lenient | — |
| LLM-answered nuance strict / lenient (n) | — |
| Eval heuristic answers | n/a |
| Eval fallback reasons (all) | n/a |
| Eval deadline timeouts | n/a |
| Eval `finish_reason:length` | n/a (logged only when the LLM answer was used; `bad_json` truncations not counted) |
| Eval provider 429s | n/a |
| Eval-observed client p50 / p95 ms (throttled eval, NOT a bench) | — |
| Bench quick client p50 / p95 / p99 ms | 49 / 103 / 410 (n 50) — **INVALID (provider 429)** |
| Bench heuristic answers | 50/50 (100.0%) |
| Bench fallback reasons (all) | rate_limited 48, bad_json 2 |
| Bench deadline timeouts | 0/50 (0.0%) |
| Bench `finish_reason:length` | not logged (logged only when the LLM answer was used; `bad_json` truncations not counted) |
| Bench provider 429s | 48/50 (96.0%) |
| Server latency_ms of deadline timeouts (min–max) | none |

## Provenance per arm (build, commit, env)

Both arms ran code from commit **8e46c2a** (S3a/S3b, `PROMPT_VERSION` **v1.1**). The pipeline is primary LLM → heuristic, with the deadline counted from t0. It has no Gemini fallback wiring; the S4a chain landed later, in 070e52b. Both arms ran on port 3027, sequentially, never in parallel.

**Shared env overrides.** Set in the shell; the dotenv file was never read or edited, and keys came from the server's own dotenv loader:
- `PORT=3027`
- `LLM_DEADLINE_MS=450`, confirmed by the "Server latency_ms of deadline timeouts" row
- `LLM_MAX_TOKENS=90`
- `LOG_LEVEL=info`

**Shared throttle.** `--tpm 7000 --tokens-per-req 850`, which gives 8 RPM. The 850 tokens/request figure is an **assumption**: no provider usage field was measured for prompt v1.1 on either model. Eval and bench ran sequentially, each with its own throttle. One warm-up call ran per server start.

| | arm A `qwen` | arm B `gptoss` | extra `gptoss-r2` |
|---|---|---|---|
| Model / effort | `qwen/qwen3.8-27b` / `none` | `openai/gpt-oss-20b` / `low` | `openai/gpt-oss-20b` / `low` |
| Server | `node dist/server.js` (main tree) | `node --import tsx src-ab8e46/server.ts` | same as B |
| Code | `dist/` built 14:08Z by `npm run build` from the main tree, right after 8e46c2a was committed (14:07:41Z). Evidence: every S4a/S4b source edit has an mtime of 14:14Z or later. `prompt.ts` is unchanged between 8e46c2a and 070e52b; its first later change is 6c333e5 (14:42:59Z), after arm A's last chunk (14:26:34Z). ESM modules load at boot (14:09:21Z). The server log has exactly one `adapter.warm-up` line, so there was one process with no restart. Later `dist/` rebuilds (14:14Z, 14:20Z) could not reach this process. The tree state at 14:08Z was not recorded, so this is inferred, not proven | verbatim `git archive 8e46c2a apps/backend/src`, placed temporarily at `apps/backend/src-ab8e46/` (same depth, so the dotenv loader resolves). That directory was an out-of-lane write, deleted afterwards and never staged; next time it goes in the scratchpad | same as B |
| `LLM_FALLBACK_API_KEY` | not blanked. 8e46c2a has no fallback wiring, and the log has **0** answers from a provider other than groq/heuristic | blanked (`=`) | blanked |
| Throttle | 8 RPM | 8 RPM | 6 RPM (`--tokens-per-req 1150`) |
| Window (UTC) | 14:09:21 → 14:26:34 | 14:27:05 → 14:44:18 | 14:44:59 → 14:53:13 |

Sanitised logs `reports/raw/serverlog-ab-*.jsonl` keep these fields from the per-chunk and warm-up lines: `time`, `level`, `msg`, `chunk_id`, `session_id`, `provider`, `ok`, `latency_ms`, `outcome`, `reason`, `finish_reason`, `status`. `hostname`, `pid` and `reqId` are dropped. No other lines are kept, including the "listening" line with a LAN IP.

## Confounds and validity
- **Runtime:** arm A ran tsc-compiled JS and arm B ran the same source through the tsx loader. Request-path code is identical after transpile; tsx adds work only at module load. Any per-request effect is unmeasured.
- **Arm B's bench is INVALID-FOR-LATENCY (5 provider 429s).** The cause is **unexplained**. Candidate causes, none measured:
  - gpt-oss's hidden reasoning tokens counting toward the 8000 TPM limit (completion up to 90 per request);
  - a per-day token quota running out after arms A and B's evals;
  - a different prompt-token count from gpt-oss's tokenizer for prompt v1.1.

  The 6 RPM re-run (`gptoss-r2`) got 429 on 48/50 requests **and on its warm-up call**. That fits quota exhaustion better than pacing, but the 429 body was not logged, so the limit type is unknown. I made no further LLM calls.
- **Arm B's eval portion had 0 provider 429s**, so its quality numbers are valid. Its eval-observed p50 sits at the deadline (see the timeout rows); it is not model latency.
- **`finish_reason:length` is undercounted** (see the inline note): `bad_json` failures carry no `finish_reason`. ADR-005's earlier evidence attributes gpt-oss truncations to reasoning tokens exhausting `max_tokens` 90; this run cannot confirm that.
- **qwen's latency is at budget: met only nominally, not demonstrated.** n is 50 and the median CI is roughly ±15–20 ms (reviewer's bootstrap; the server-side CI in the table shows the same order of dispersion). The choice does not depend on it. Treat it as "at budget" until S8a trims the prompt and a full bench (n 400) runs. This was measured on one machine and region, on loopback, with prompt v1.1 **without session context**. S5 adds context turns (prompt v1.3), which adds input tokens. Note that `scripts/gate.mjs` checks `p50 ≤ 250`, while CLAUDE.md says `< 250` (review N13, backend-dev).
- Tune split only, single labeller, no holdout. The LLM-answered rows compare different chunk subsets. gpt-oss's subset is small and biased toward chunks that finished before the deadline, so if anything that comparison favours gpt-oss.

## Recommendation (to the human, CP1)
**Set the primary to `qwen/qwen3.8-27b` with `LLM_PRIMARY_REASONING_EFFORT=none`.** On all chunks, qwen has the higher macro-F1, nuance-subset accuracy, and F1 on all 7 classes. On LLM-answered chunks only, qwen leads on 5 classes. Neutral ties, and gpt-oss's negative F1 rests on a single chunk. qwen is the only arm that meets the TASKS S3c latency rule under my validity rule (no provider 429), but only nominally (see above). **The decision rests on quality, not on that latency margin.**

`openai/gpt-oss-20b` (effort low) is **not viable at `max_tokens` 90** in this setup: most eval chunks fell back to the heuristic (timeouts plus `bad_json`), and quality dropped to near the heuristic baseline.

Conditions attached to the recommendation:
1. **Latency is at budget.** S8a should trim the prompt (about 680 tokens per backend-dev's S3 handoff, target about 550). Re-bench in full after S5 context.
2. **qwen3.8-27b is a Groq Preview model** (ADR-005). Record this in ARCHITECTURE.md limitations. SETUP.md should document the `LLM_PRIMARY_MODEL` alternatives for evaluator keys.
3. **Rate safety:** the org limit is 8000 TPM. Measure the tokens per request for the shipped prompt before sizing throughput claims; this run does not measure it.

Next steps (owners):
- backend-dev: the `.env.example` defaults (37ea100 already moved the default primary to qwen3.8-27b);
- spec-architect: amend ADR-005 with a link to this report.
