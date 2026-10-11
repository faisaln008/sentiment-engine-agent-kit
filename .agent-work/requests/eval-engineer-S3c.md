# Requests from eval-engineer (S3c, CP1 A/B), evidence: reports/ab-cp1.md

## → human (CP1 decision)
Recommendation: primary `qwen/qwen3.8-27b` with `LLM_PRIMARY_REASONING_EFFORT=none`. Rationale, numbers and conditions are in reports/ab-cp1.md ("Recommendation"). Latency is at budget: met only nominally, not demonstrated (n 50); the choice does not depend on it.

## → backend-dev
1. Once the human approves: `.env.example` defaults `LLM_PRIMARY_MODEL=qwen/qwen3.8-27b`, `LLM_PRIMARY_REASONING_EFFORT=none`.
2. Log `finish_reason` on `bad_json` failures too (not only when the LLM answer is used). gpt-oss truncations currently show up as `bad_json` without a finish_reason, so `finish_reason:length` is undercounted (33 eval / 18 bench `bad_json` in arm B).
3. Optional: log the 429 body's limit type (TPM vs TPD) as a short enum, so that quota exhaustion can be distinguished from pacing. The arm-B re-run got 429 on 48/50 requests at 6 RPM.
4. Review N13: `scripts/gate.mjs` checks `p50 <= 250`, but CLAUDE.md says p50 < 250. Please align them.

## → spec-architect
Amend ADR-005 with the result and a link to `reports/ab-cp1.md`:
- qwen selected on quality (subject to the human);
- gpt-oss-20b is not viable at max_tokens 90 (most eval chunks fell back to the heuristic);
- the cause of the bench 429s is unexplained (reasoning tokens toward TPM / daily quota / tokenizer), and tokens per request for the shipped prompt remain unmeasured.
