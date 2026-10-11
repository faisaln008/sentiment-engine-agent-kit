# Request: api-contract skill clarifications (from spec-architect, 2026-10-11)
Proposals for the human; contracts draft currently implements the proposed readings.

1. **WS `analysis` frame: add `timestamp_ms`** (additive). Reason: the stream shows chunk time; without it the client must use arrival time, which is wrong for replayed/out-of-order chunks.
2. **Summary `top_risk_moments` filter (r2, after review B2):** only `high`/`critical` (same as reference), sorted risk desc then most recent first. Proposal: state the filter in the skill.
3. **Summary `aggregated_volatility_score` (r2, after review B2):** fraction of flagged chunks, 2dp (same as reference). Proposal: state it in the skill.
4. **Empty/whitespace `text`.** Skill: "required; trim". Proposal: string required (else 400), empty after trim → 200 neutral short-circuit with no LLM call.
5. **`/health.mode` values.** Skill lists `llm:groq|llm:gemini|heuristic`; CLAUDE.md allows `llm:<provider>`. Contracts accept `/^(llm:[a-z0-9._-]+|heuristic)$/` so Cerebras/Ollama keys work.
