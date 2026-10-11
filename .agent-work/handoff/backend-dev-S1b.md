# backend-dev S1b handoff (paired review with S1a)

## Changed
- NEW apps/backend/src/heuristics/{lexicon,copy,rule-classifier}.ts: word-boundary regex lexicon, ordered by taxonomy tie-break (aggressive > sarcastic > deflecting > appeasement > negative > positive > neutral). Ultimatum/blame, strong sarcasm phrases or intensifier+positive in negative-context/slow-rate, deflection markers, appeasement markers, "no problem" treated as benign. Acoustics: weak only (arousal z-score vs priors, imputed fields = 0; long pause) -> confidence +0.05 and risk bump. Confidence cap 0.6; always ok:true; speaker-aware intent/mitigation copy (<=60/<=120).
- DELETED heuristics/placeholder.ts; app.ts now defaults to heuristicClassifier.
- apps/backend/package.json: fastify -> ^5.12.0.
- Tests: heuristic.test.ts (7 labels, "know"/"notable" != "no", conf cap, risk, speaker-aware, <0.5 ms/call), reference-contract.test.ts (sample-chunk.json shape, key supersets with hard-coded reference key sets, boot.no-keys.serves-heuristic, pipeline.empty-text-neutral, pipeline.whitespace-text-neutral with spy classifier). No test reads docs/assignment.
- Blank-text short-circuit already uses isBlankText (S1a analyze-chunk.ts); unchanged.

## Reference empty-body observation (ran `npm run reference`, port 3001, then stopped)
- POST `{}` (json) -> 200, body `{"processing_latency_ms":0,"sentiment":"neutral","confidence":0.63,"volatility_flag":false,"hidden_intent":"informational","mitigation_suggestion":"Ask an open-ended question to surface intent","risk_level":"low"}` (no chunk_id).
- POST with no body and no content-type -> identical 200.
- GET /health -> `{"status":"ok","mode":"placeholder","version":"1.1.0","timestamp":<ms>}`.
- Matches CLAUDE.md / SPEC §2.4 (200 without chunk_id). Ours returns 400 for these by design.

## Verified
`npm run gate`: PASS typecheck, PASS lint+prettier, PASS test (6 files, 40 tests), eval/bench SKIPPED (backend not up; S2).

## Risks
- Heuristic accuracy is unmeasured until S2 eval; rules are deliberately coarse (e.g. any DEFLECT word like "board" or "legal" => deflecting, "only/just" as sarcasm context).
- Negation not modelled ("not bad" -> negative).
- Heuristic arousal uses population priors, not the session baseline (S4 baseline not yet built).
- Did not need ai-log entry (no corrections).
