# ADR-003: Deterministic volatility and risk fusion
Date: 2026-10-11 · Status: accepted (frozen with SPEC.md 2026-10-11; normalisation + same-speaker reading approved by the human, Q6)

## Context
"Rapid emotional volatility shifts" and "high-risk moments" are scored. LLMs are inconsistent at arithmetic
and cannot see the speaker's acoustic history unless we spend tokens on it. CLAUDE.md §2.5: LLM does semantics,
code does math. Canonical formula and floors: `.claude/skills/nuance-taxonomy/SKILL.md` §5–6.

## Options considered
| Option | Pros | Cons |
|---|---|---|
| A. LLM outputs volatility + risk directly | No code | Non-deterministic, untestable, more output tokens, ignores baselines |
| B. Absolute acoustic thresholds (reference backend: `pitch > 0.65 \|\| wpm > 190`) | Trivial | Ignores speaker norms; no valence shift; mislabels fast talkers |
| **C. Deterministic fusion: per-speaker z-scores + valence shift → `v`; LLM risk → floors/ceilings** | Testable, explainable, tunable by eval, zero tokens | Weights are priors until eval tunes them |

## Decision
**C**, implemented as pure functions in `apps/backend/src/domain/{acoustic-baseline,volatility,risk,fusion}.ts`.

1. **Baseline** per `session_id × speaker`: Welford running mean/std over observed (non-imputed) fields.
   For the speaker's first 2 chunks use population priors (SPEC §4). `std_eff = max(std, 0.5·prior_std)`.
2. **arousal_z** = mean of z(pitch_volatility), z(speech_rate_wpm), z(volume_intensity); imputed fields contribute z = 0.
   Pause is excluded from arousal (it signals hesitation, used as a prompt descriptor instead).
3. **Volatility** (skill formula, with normalisation we had to define):
   `v = clamp01( 0.4·min(1, |arousal_z − prev_arousal_z| / 2) + 0.4·valence_shift + 0.2·pitch_volatility )`
   - "prev" = the **same speaker's** most recent committed chunk that orders before the current one (snapshot at arrival).
     **Ordering key = (`timestamp_ms`, arrival order).** Equal `timestamp_ms` values are ordered by arrival: the earlier-arrived chunk comes first and counts as "prev" for the later one (T21, orchestrator decision 2026-10-11). The same key orders context turns and the ordered commit (ADR-004). The chunk itself (same `chunk_id`) is never its own prev.
   - `valence_shift = |val(prev) − val(cur)|` with val: positive 1, appeasement .6, neutral .5, deflecting .4, negative .3, sarcastic .2, aggressive 0.
   - No previous chunk for that speaker ⇒ arousal and valence terms = 0 (only pitch term; max 0.2 → cannot flag on first chunk).
   - `volatility_flag = v ≥ VOLATILITY_THRESHOLD` (default 0.6).
   The `/2` normaliser and the "same speaker" reading are ours (skill leaves them undefined) — proposed upstream in
   `.agent-work/requests/skill-nuance-taxonomy.md`.
   **Evaluation order (r2, review N10): volatility (3) → confidence (4) → risk (5).** Risk rules use the calibrated confidence.
4. **Confidence**: LLM `c` clamped [0,1]; heuristic capped 0.6; when delivery contradicts a positive/neutral text
   label (|arousal_z| ≥ 1.5) multiply by 0.85. Rounded to 2dp last; this calibrated value is both the response field and the input to (5).
5. **Risk**: start from LLM `r` (heuristic supplies its own). Apply in order:
   1. `aggressive` ⇒ risk ≥ `high`
   2. `aggressive` ∧ `volatility_flag` ⇒ `critical`
   3. `positive` ∧ calibrated confidence ≥ 0.8 ⇒ risk ≤ `medium`
   Missing/invalid `r` from the LLM ⇒ default by sentiment: aggressive high · sarcastic/deflecting medium · negative medium · appeasement medium (candidate) / low (counterpart) · positive/neutral low.
6. **Summary** (r2, review B2): `aggregated_volatility_score` = fraction of flagged chunks (reference definition); per-chunk `v` is retained for eval reports only.

## Evidence
Formula source: nuance-taxonomy skill §6 (human-owned). Weights/threshold are **priors, not measured** — eval (S8) reports volatility P/R/F1 and may tune them; any change is recorded here with a link to `reports/eval-latest.md`.

## Consequences
- Volatility needs ≥ 2 chunks per speaker to fire on arousal/valence; eval dataset must include multi-turn shifts (S2a).
- Tuning risk: three free weights + threshold on ~80 chunks overfits easily — tune on `tune.jsonl` only, check holdout once.
- Out-of-order chunks compute volatility against whatever was committed at arrival (documented limitation, ADR-004).
