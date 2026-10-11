# Request: llm-provider-integration skill — align fallback chain with human decision H2 (spec-architect, 2026-10-11)

The human decided at freeze (SPEC §11.2 H2, ADR-001 option D2): **no timer hedge**. The skill's "Fallback chain" section still says
"after HEDGE_AFTER_MS … start fallback (primary keeps running) … first ok wins". Agents reading the skill will re-introduce the hedge.

Proposed replacement text:
```
start primary ──► ok? return
   │ only on error (http/network/401/403/5xx, bad_json), rate_limited (429), circuit_open, no_key, in-flight cap
   └─► start fallback with the remaining budget (deadline − elapsed) ──► ok? return
at DEADLINE_MS (counted from handler entry) ──► abort in-flight ──► heuristic
```
Also remove `HEDGE_AFTER_MS` from the skill and from the anti-pattern note "retries on the hot path beyond the hedge" (→ "beyond one fallback").
Related: latency-engineering skill "Hedge, don't retry" and its cache-key rule (cache is cut, H1) — see `skill-latency-engineering.md`.
