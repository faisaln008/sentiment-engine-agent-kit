# S4b review r1 (single) — REQUEST_CHANGES

> Written by code-reviewer (read-only; no servers, no provider calls); saved by the orchestrator.

Reviewer checks: vitest 154/154; typecheck 0; lint 0. Agent heuristic gate: smoke PASS, bench p50 1 / p95 4.

## Reviewer overfit check (NOT an official eval)
Scratch script imported `classifyRules` directly (no server/network), HEAD 070e52b vs S4b, both splits:

| split | HEAD strict | S4b strict | HEAD lenient | S4b lenient |
|---|---|---|---|---|
| tune (n=89) | 47.2 | 67.4 | 55.1 | 77.5 |
| holdout (n=28) | 46.4 | 46.4 | 57.1 | 64.3 |

Holdout strict gain 0; the +2 lenient holdout items come from T1/T2 narrowing, not from new recall markers. **All 26 new marker alternatives fire on 0 holdout items**; on tune almost each fires only on the 1–2 items it was added for. T1/T2 generalises; step-2 recall markers (+16.8 strict on tune) are fitted — must not be cited as heuristic quality. Handoff's "no dataset sentence is copied" is inaccurate: verbatim tune sequences include "wasting each other's time", "let me see what I can do", "I'm sure we can", "take that back to", "of course. because", "right. and", "I suppose", "so flexible", "sometime after", "conversation for", "trust me", "not good enough".

## Blocking
- **B1** `heuristics/lexicon.ts:5,11,16,19` — dataset-specific markers. Drop SARCASM `right\. and`, `of course\.? because`, `i suppose`, `(?:so|how) flexible` (fires on counterfactual pair s08_c07 positive vs s13_c04 sarcastic), `wow` (fires on positive s07_c02); DEFLECT `trust me`. Generalise DEFLECT `conversation for` → `conversation for (?:later|another (?:day|time)|after\b)`; `sometime after` → general deferral family; APPEASE `we understand` → `we (?:completely|totally|fully) understand`. Keep generic idioms (concession verbs, apologies, "let me see what I can do", "looking into it", "touch base", "will revert", "X needs to review", "pick/revisit … next/later", "take that back to", "wasting our/my/each other's time"). Re-run tune eval labelled "tune (fitted)"; add reviewer-style holdout figure labelled not official.
- **B2** `lexicon.ts:5,11,19` — new false positives push benign speech to high/critical: "We can do either the annual or the monthly plan…" and "Either Tuesday or Wednesday works…" → aggressive/critical; "Wow, that's a great offer…" and "Thanks for being so flexible…" and "I suppose that could work." → sarcastic/high; "That's not good enough for us, but let's keep talking." → aggressive/critical; "We understand your concern…" → appeasement; "Trust me, this is the best tier…" → deflecting. Fix: `either…or` only with a consequence clause (`either\b[^.?!]{0,80}\bor (?:we|i)(?:'ll| will| are| am|'re)? (?:walk|go|leave|move|sign with|take our business|pull|cancel|terminate)`); move `not good enough` from ULTIMATUM to negative polarity; add these (or reworded) as `not.toBe(...)` regression tests.

## Non-blocking
- **N1** two steps vs "one change" — record in handoff.
- **N2** `lexicon.ts:5` "Please sign by Friday so we can start onboarding…" → aggressive/critical (also at HEAD); require consequence or cap at high. Ticket.
- **N3** `lexicon.ts:36` NEGATED_WALK misses won't/will not/wouldn't.
- **N4** `lexicon.ts:19` "I'm sorry, but that price is unacceptable." → appeasement; skip apology markers before but/however.
- **N5** `analyze-chunk.ts:171-173` emergency NEUTRAL labelled provider 'heuristic' — consider 'none'; comment re-throw path.
- **N6** `app.ts:62-63` error log includes err.message (JSON.parse messages can quote input) — latent; log name + allow-listed message.
- **N7** add B2 probes and one test per kept marker family (non-dataset wording).
- **N8** regex precompile still open (0.059 ms/call, cosmetic).

## Focus
1 Overfitting FAIL (B1, B2) · 2 Word boundaries/negation/ReDoS/latency PASS (0.06 ms/call; bounded regexes) · 3 Exception safety PASS (sync + rejection; ids logged; no text at info) · 4 T11/T13 PASS.

## Checklist
1 Lanes PASS · 2 Contract PASS · 3 Boundaries PASS · 4 Async PASS · 5 Failure modes PASS · 6 Latency PASS · 7 Tests PASS w/ gaps (N7) · 8 Types PASS · 9 Security PASS (N6 latent) · 10 Simplicity FAIL on lexicon scope (B1)

Reviewer scratch scripts (re-runnable, scratchpad): run.mts (split scores), markers.mts (marker hit map), probe.mts (false-positive probes).
