# AI collaboration log
Append-only. One line per incident where AI output was wrong and had to be corrected.
Format: `- [agent][slice] what was wrong → how detected (test/review/hook/eval/human) → fix`
- [spec-architect][kickoff] Pre-filled `.env.example` fallback `gemini-2.5-flash-lite` is restricted to prior users per Google models/deprecations docs (2026-10-11) → WebFetch of official docs → recommend `gemini-3.5-flash-lite` (SPEC Q2, ADR-001)
- [spec-architect][kickoff] CLAUDE.md claims reference backend returns 500 on missing body; Express 4 `express.json()` likely yields `{}` → 200 without `chunk_id` → code reading (unconfirmed) → marked UNVERIFIED, S1b contract test records actual behaviour
- [spec-architect][kickoff] Verdict cache key (copied from skill) ignored counterpart context → context-flip pairs would be cross-served → code-reviewer spec-r1 B1 → key = sha1(model + prompt version + full dynamic block), S7b marked first-cut candidate
- [spec-architect][kickoff] `timestamp_ms` preprocess let 1e20 through to zod 4 `.int()` → 400 on a lenient field → code-reviewer spec-r1 B3 → require safe integer ≥ 0 else undefined; contract test added
- [spec-architect][kickoff] Summary defaults (mean v, medium+ moments) silently changed values vs reference → code-reviewer spec-r1 B2 → adopted reference definitions

- [backend-dev][S1a] AbortSignal.timeout(449.16) threw RangeError (non-integer delay) inside try, silently turning every response neutral; first tests passed because the catch fallback is also schema-valid → noticed when the truncation/confidence test got 0.5 instead of 0.78 and a debug log → Math.floor the remaining budget.
- [backend-dev][S1a] Used macOS-incompatible `sed -i` without '' suffix; edits silently not applied → noticed typecheck still failing → rerun with `-i ''`.
- [backend-dev][S1a] Handoff claimed fixes that were not made (vitest `@app/contracts` alias N4; 415 -> 400 mapping) and the truncation test used 60/100-char inputs so never truncated → code-reviewer S1-r1 B1-B3 → made the fixes, verified with contracts/dist deleted, exact-string assertions; lesson: verify each claimed fix by command before writing it in a handoff.
