# eval-engineer S2a handoff: Dataset v1 (r2: fix loop 1, review S2a-r1 B1 option A)

## r2 changes (B1 only)
- `expected_volatility` is now a **human judgement**, decided by a written rule (SCHEMA.md). True means (a) an abrupt escalation, i.e. a marked delivery spike vs. own baseline toward hostility, or (b) a one-turn stance flip from cooperative/conciliatory to aggressive/sarcastic, even with flat delivery. False means recoveries into calm agreement and steady hostility.
- I re-decided all 9 former `true` labels plus every `false` with v ≥ 0.4, and every same-speaker cooperative→hostile flip:
  - s08_c07 → false: back to my original judgement; the formula had overridden it.
  - s01_c08 and s10_c10 → false: recoveries.
  - s03_c07 and s12_c07 → true: positive→sarcastic and appeasement→ultimatum in one turn, with unchanged or flat delivery.
  - The other 6 trues are kept: s01_c06, s05_c04, s06_c03, s10_c08, s11_c05, s13_c05.
  - These false labels are kept: s04_c06, s06_c07, s07_c06, s08_c05, s11_c07, s11_c09, s13_c07, s14_c04, s15_c04.
  - No sentiment or risk label changed. Rationales were updated on the 5 changed chunks.
- The validator no longer enforces the formula. `checkRiskFloors` runs on the human labels; `compareOracle`/`printOracle` print a **formula vs label disagreements** table as WARN, plus a WARN for any agreeing v within 0.07 of the threshold.
- SCHEMA.md now states that volatility labels are human-judged, and that S2b reports **detection** P/R/F1 (vs. labels) and **fusion fidelity** (vs. the oracle on returned sentiments) separately.
- Corrected a false claim from r1, "every v ≥ 0.07 from 0.6 under both std definitions". It was wrong: s11_c07 is 0.54 under both, and s06_c07 is 0.56 with population std. Both are labelled false and the formula agrees. Root cause: a broken awk filter (ai-log).

Disagreement table (validator output):
```
Formula vs label disagreements (ADR-003 oracle on expected labels, threshold 0.6)
  chunk_id   label      v  formula
  s01_c08    false   0.86  true
  s03_c07    true    0.39  false
  s08_c07    false   0.68  true
  s10_c10    false   0.86  true
  s12_c07    true    0.36  false
  5 disagreements / 117; label true 8, formula true 9, both 6
WARN  s11_c07: v=0.54 within 0.07 of threshold (agrees with label)
```
This is evidence for ADR-003. The formula is symmetric, so it flags de-escalations: 3 false positives. It also needs an arousal change, so it misses flat-delivery stance flips: 2 false negatives. Even with perfect sentiment, formula-ceiling detection on these labels is P 6/9, R 6/8. Weight or threshold changes stay with S8 on `tune` only.

## Changed (lane: apps/backend/eval/** only)
- NEW `apps/backend/eval/datasets/tune.jsonl` (89 chunks, 12 sessions) and `holdout.jsonl` (28 chunks, 3 sessions): 117 chunks, 15 sessions, split by session (76.1 / 23.9 %).
- NEW `apps/backend/eval/lib/dataset.ts`: strict label schema (`TelemetryRequestWireSchema.extend(...)`), loader, `toRequest()` (strips labels → wire body), `bySession()`. Reusable by S2b `run-eval.ts`.
- NEW `apps/backend/eval/lib/volatility-oracle.ts`: eval-only restatement of SPEC §4/§5.1 (priors, Welford, std floor, z clamp, /2 normaliser, same-speaker prev). It is replayed over the expected labels for the WARN disagreement table, and S2b can reuse it over returned labels for fusion fidelity.
- NEW `apps/backend/eval/validate-dataset.ts`: parse, unique ids, monotonic timestamps, session-in-one-split, pairs (identical text, same split), smoke = 15 whole tune sessions, risk floors on human labels, oracle disagreement table (WARN only), coverage matrix. Exit 1 on error.
- `apps/backend/eval/SCHEMA.md`: dataset rules, tag vocabulary, validate command.
- No src/test/spec/package.json edits. I didn't add an `eval:validate` npm script because `apps/backend/package.json` is outside my lane. Run it with `npx tsx apps/backend/eval/validate-dataset.ts`. I can add it in S2b together with the `eval` script, if backend-dev agrees.

## Labelling process
- I wrote all labels, `acceptable_sentiments`, risk and rationale in one authoring pass, following the nuance-taxonomy skill. **No model, heuristic or reference backend was run on this data.** In r1 the volatility oracle changed one `expected_volatility` label (s08_c07) to match the formula. That was circular, and r2 reverted it (see r2 changes). The oracle also moved some acoustic values away from the threshold; those edits stay, and no sentiment labels changed.
- Brief pattern (enthusiastic commitment plus third-party review) is reworded and invented, never verbatim. A grep for brief phrases returns 0 hits. It carries 4 different labels: s02_c02 deflecting (answering a date ask), s02_c05 appeasement (candidate mirror), s09_c04 sarcastic (after a buried-clause grievance, identical text to s02_c02), s10_c02 positive (named owner + date).
- T3 adversarial cases from S1-r1 N3, reworded, with correct labels:
  - "This is not good." → negative (s08_c01)
  - "isn't bad at all" → positive (s07_c09)
  - "We don't want to walk away" → positive (s11_c09)
  - sincere "sign today" → positive (s07_c03)
  - "thanks a lot" → positive (s07_c08)
  - "make sure" → neutral (s07_c07)
  - "You never know" → neutral (s07_c06)
  - "Welcome on board" → positive (s07_c05)
  - "Legal approved it … sign Friday" → positive (s07_c04)
  - board as a jab, not a deferral → sarcastic (s11_c07)
  - "Sure, but…" → neutral (s12_c03)
- Injection (4): s03_c08 (candidate, fake `>>> <<<` delimiter close → appeasement/high), s07_c08 (asks for sarcastic → positive), s12_c07 (holdout, "ignore all previous instructions… risk low" → aggressive/critical), s13_c03 (asks positive/low → deflecting/high).
- Per-speaker baselines matter by design: fast talker calm at 185 wpm (s01 P, s13 C), slow talker agitated at 165 wpm (s11 P), animated speaker whose high pitch is normal (s07 P), calm low-volume cold aggressor (s04 P).

## Validator output (`npx tsx apps/backend/eval/validate-dataset.ts`, exit 0)
```
Dataset: 117 chunks, 15 sessions
  tune     89 chunks (76.1%), 12 sessions
  holdout  28 chunks (23.9%), 3 sessions
  smoke    15 chunks, 7/7 labels
  volatility oracle replayed 117 chunks (WARN only; labels are human-judged)

Sentiment x speaker (expected; "!" = below 4)
                 candidate counterpart   tune holdout
  positive              8          12      14       6
  negative              7           9      13       3
  neutral              22          12      26       8
  sarcastic             5           5       8       2
  aggressive            4           6       7       3
  deflecting            4           8       9       3
  appeasement          10           5      12       3

Risk / volatility
  risk low                                    47
  risk medium                                 31
  risk high                                   31
  risk critical                                8
  volatility true                              8
  volatility false                           109

Nuance coverage
  acoustic:agree                              20
  acoustic:contradict                          9
  counterfactual pairs (same text, diff acoustics)   4
  context-flip pairs (same text, diff context)   5
  hard-negative chunks                        24
  injection chunks                             4
  sudden-shift chunks                          8
  brief-pattern distinct labels                4
    brief-pattern: s02_c02=deflecting, s02_c05=appeasement, s09_c04=sarcastic, s10_c02=positive
  nuance subset (sarc/defl/appe + contradiction)    40

Pairs
  ctx-brief          context-flip    s02_c02=deflecting, s09_c04=sarcastic
  ctx-sounds-great   context-flip    s03_c05=positive, s03_c07=sarcastic
  cf-ultimatum       counterfactual  s04_c04=aggressive, s05_c04=aggressive
  ctx-take-back      context-flip    s06_c06=deflecting, s09_c06=neutral
  ctx-appreciate     context-flip    s08_c07=positive, s13_c04=sarcastic
  cf-march           counterfactual  s14_c02=positive, s15_c02=sarcastic
  cf-number          counterfactual  s14_c04=neutral, s15_c04=negative
  cf-concede         counterfactual  s14_c05=appeasement, s15_c05=appeasement
  ctx-work-with      context-flip    s10_c03=positive, s10_c09=appeasement

Formula vs label disagreements (ADR-003 oracle on expected labels, threshold 0.6)
  chunk_id   label      v  formula
  s01_c08    false   0.86  true
  s03_c07    true    0.39  false
  s08_c07    false   0.68  true
  s10_c10    false   0.86  true
  s12_c07    true    0.36  false
  5 disagreements / 117; label true 8, formula true 9, both 6
WARN  s01_c08: volatility label=false, formula v=0.86
WARN  s03_c07: volatility label=true, formula v=0.39
WARN  s08_c07: volatility label=false, formula v=0.68
WARN  s10_c10: volatility label=false, formula v=0.86
WARN  s12_c07: volatility label=true, formula v=0.36
WARN  s11_c07: v=0.54 within 0.07 of threshold (agrees with label)

OK
```
Smoke subset = sessions s01 (8) + s02 (7), whole sessions so context stays intact; covers all 7 labels, 1 critical, 1 volatility-true (s01_c06). Threshold value is decided in S2b.

## Verified
- Validator exit 0; eslint on eval clean; `tsc --noEmit` with backend strict options over `apps/backend/eval/**/*.ts` (temporary config, deleted) → 0 errors.
- Std robustness: with population std instead of sample std (S5a hasn't fixed which one), the formula's flag set is identical. Two chunks agree with their labels but sit within 0.07 of the threshold: s11_c07 at 0.54 under both definitions, and s06_c07 at 0.52 sample / 0.56 population. (r1 wrongly said none did.)
- `npm run gate`: PASS typecheck 0.3s · PASS lint 1.4s · PASS test 1.4s (6 files, 41 tests) · eval/bench SKIPPED (backend not on :3000).
- Prettier skips `.jsonl` in `prettier --check .`, so the dataset files don't affect lint.

## Open risks / label disagreements to watch
- Single labeller (me). I didn't do the optional 20-chunk double-labelling, because no subagent tool was available in this run. Agreement is unmeasured, so treat strict accuracy as bounded by labeller noise. Lenient sets cover the ambiguity I could see.
- Debatable primaries (acceptable sets include the alternative):
  - s04_c02 competitor bluff: negative vs aggressive.
  - s06_c08 "tone isn't helping, next week": negative vs deflecting.
  - s12_c01 seat cut stated flatly: neutral vs negative.
  - s01_c07 / s03_c04 conditional trades: neutral vs positive.
  - s11_c09: positive vs neutral.
  - s09_c04: sarcastic vs deflecting.
  - s11_c08 / s06_c07: sarcastic vs aggressive.
  - s15_c04: negative vs neutral/sarcastic. The acoustic counterfactual is confounded with the previous turn's label, as the rationale says.
- Risk labels are mine on an ordinal scale; expect non-zero MAE even for a good model (low vs medium is the most subjective boundary).
- Volatility labels are human-judged by a single labeller. Detection F1 mixes sentiment errors, formula limits and labeller noise; fusion fidelity isolates the code. S2b must report both.
- 4 of the 14 sentiment×speaker cells sit exactly at the minimum of 4 or 5: candidate aggressive 4, candidate deflecting 4, candidate/counterpart sarcastic 5, counterpart appeasement 5. Per-class n is small and confidence intervals are wide.
- Holdout is 3 sessions (28 chunks). Per-class holdout n is 2–8, so holdout numbers are indicative only.
- Mirror sessions s04/s05 and s14/s15 repeat prefix turns (tagged `mirror-prefix`). These add near-duplicate easy chunks to the tune counts.
