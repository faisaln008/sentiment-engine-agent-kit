# Request: nuance-taxonomy skill clarifications (from spec-architect, 2026-10-11)
Not edits — proposals for the human. SPEC.md / ADR-003 currently use the proposed readings.

1. **§6 `|Δarousal_z|` is unbounded.** With weight 0.4, a z-change of 3 alone contributes 1.2 and flags volatility regardless of text.
   Proposal: `0.4·min(1, |Δarousal_z| / 2)` and `clamp01` on `v`. Reason: keeps each term in [0,1] so weights mean what they say.
2. **§6 "previous chunk" for valence_shift is ambiguous** (session's previous chunk vs the same speaker's).
   Proposal: same speaker's previous chunk for both terms. Reason: candidate positive → counterpart aggressive is a disagreement, not one person's emotional shift; cross-speaker contrast is already visible via context to the LLM and via risk.
3. **First chunk of a speaker cannot flag volatility** (only 0.2·pitch). Accept, or add an absolute-arousal term (e.g. `+0.3·max(0, arousal_z−2)/2`) for cold starts? Recommend: accept for now; revisit only if eval shows misses.
4. **§5 risk default when the model omits `r`** is unspecified. Proposal: aggressive high · sarcastic/deflecting/negative medium · appeasement medium (candidate) / low (counterpart) · positive/neutral low.
