---
name: nuance-taxonomy
description: Canonical label definitions and decision rules for sentiment (7 classes), hidden_intent, risk_level, volatility and mitigation wording, plus how to read acoustic cues relative to a speaker baseline. Use whenever writing the LLM prompt, labelling eval data, specifying fusion rules, reviewing classification logic or explaining the approach in docs.
---

# Nuance taxonomy (single source of truth)

The prompt, the eval labels and SPEC.md §3 all use **this wording**. Change it here only (human-approved),
then re-run eval. Never derive rules from the single example in the brief.

## 1. Sentiment — decide by *intent*, not surface words

| Label | Use when | NOT when (nearest confusable) |
|---|---|---|
| `positive` | Genuine agreement, appreciation or enthusiasm; words, context and delivery agree; no qualifier that cancels it | Praise contradicted by context → `sarcastic`; agreement that dodges commitment → `deflecting` |
| `negative` | Direct disagreement, dissatisfaction or rejection; speaker engages the issue; no pressure tactic | Threat/ultimatum/blame → `aggressive`; avoids the issue → `deflecting` |
| `neutral` | Informational, procedural, clarifying questions; no evaluative load | Neutral words with a stalling function → `deflecting` |
| `sarcastic` | Literal meaning is the opposite of intended meaning: praise/agreement contradicted by context (prior complaint, outage, bad offer), exaggerated intensifiers ("sure", "totally", "obviously", "brilliant"), mock concession | Positive words consistent with context → `positive`; plain complaint → `negative` |
| `aggressive` | Pressure or dominance: ultimatum, walk-away threat, blame, personal attack, deadline coercion, "take it or leave it". **Cold aggression counts** — polite words + threat content is still aggressive | Firm but respectful boundary ("we can't go below X") → `negative` |
| `deflecting` | Avoids the question or commitment: shifts to a third party (legal, procurement, board), postpones without a date, vague generalities, answers a different question, process shields — **even when wrapped in positive words** | Gives a concrete owner + date/number → `positive`/`neutral` |
| `appeasement` | Soothing or conceding to reduce tension rather than on merit: premature concessions, over-apologising, "whatever works for you", giving value without asking anything back. Most common on the **candidate** side | Agreement after a fair exchange → `positive` |

**Tie-break (two labels fit equally):** `aggressive` > `sarcastic` > `deflecting` > `appeasement` > `negative` > `positive` > `neutral`
(prefer the label the negotiator must act on).

**Context rule:** read the last turns. The same sentence after a concession vs. after a threat can change label.
"Sounds great." after a 30% price hike the speaker complained about → `sarcastic`; after a discount they asked for → `positive`.

## 2. Acoustic cues — always relative to *this speaker's* baseline

Absolute values are weak evidence (187 wpm is calm for one person, agitated for another). Use z-scores from
the session baseline; fall back to population priors for the first 2 chunks of a speaker.

| Cue (vs. baseline) | Supports | Caveat |
|---|---|---|
| ↑ pitch volatility + ↑ volume + ↑ rate | high arousal: anger, excitement, pressure | Valence comes from text, not acoustics |
| Long pause (≫ baseline, or > ~800 ms) before answering a direct ask | hesitation, discomfort, `deflecting` | Could be thinking; weak alone |
| Slow rate + flat or exaggerated pitch on positive words | `sarcastic` or disengaged | Needs a contextual contradiction too |
| ↓ volume + ↑ rate on concessions | nervous `appeasement` | — |
| Delivery contradicts words | lower confidence unless text is unambiguous | Contradiction is a signal, not noise |

**Acoustics never decide sentiment alone.** They (a) disambiguate between candidate labels, (b) adjust confidence,
(c) feed volatility.

## 3. hidden_intent (≤ 60 chars)
Format `<tactic>_via_<means>` in snake_case, e.g. `deflection_via_legal_delay`, `anchoring_via_competitor_bluff`,
`pressure_via_deadline`, `concession_without_trade`, `testing_walkaway`. `none_detected` when nothing hidden.

## 4. mitigation_suggestion (≤ 120 chars)
Imperative, specific, one move. Speaker-aware:
- counterpart chunk → what the negotiator should say/do next ("Propose joint legal review with a fixed date this week")
- candidate chunk → coaching ("You're conceding without a trade — ask for a 2-year term in return")
Never generic ("Stay calm", "Continue monitoring").

## 5. risk_level (deal impact, not emotion intensity)
- `low` — cooperative, on track
- `medium` — resistance or negativity that a normal response handles
- `high` — tactic threatening a key term: deflection on a must-have, sarcasm about the core offer, aggression, candidate concession on price
- `critical` — explicit walk-away/ultimatum, deal-break signal, or aggression **with** volatility
Fusion floors (deterministic, in `domain/risk.ts`): `aggressive` ≥ high; `aggressive`+volatility ⇒ critical; `positive` with confidence ≥ 0.8 ≤ medium.

## 6. Volatility (deterministic — the LLM does not decide this)
`v = 0.4·|Δarousal_z| + 0.4·valence_shift + 0.2·pitch_volatility`, where `Δarousal_z` is the change in
mean acoustic z-score vs. the speaker's previous chunk and `valence_shift` ∈ [0,1] is the distance between the previous
and current sentiment on the valence scale (positive 1, appeasement .6, neutral .5, deflecting .4, negative .3, sarcastic .2, aggressive 0).
`volatility_flag = v ≥ VOLATILITY_THRESHOLD`. Weights are a starting point — tune with eval, record in ADR-003.
