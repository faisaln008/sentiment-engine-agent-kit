# Audit-fix review r1 — APPROVE

> Written by code-reviewer (read-only); saved by the orchestrator. Security-auditor r2 (.agent-work/security/audit-r2.md): 0 critical, 0 high; ship-blockers: none.

Reviewer vitest (audit-fixes, adapter, heuristic, session) 64/64; orchestrator typecheck 0, lint 0, vitest 241/241; agent heuristic gate p50 1 / p95 3, errors 0.

## Blocking
none

## Non-blocking
- **N1** `infra/safe-error.ts:7` ZodError message first line is `[` — log `issues.map(path, code)`; optionally stack at debug.
- **N2** `heuristics/lexicon.ts:13` T22 consequence regex misses `'re`/`'m` and inflected verbs ("or I'm cancelling", "or we're walking") — add `'re|'m`, optional `be`, `\w*`; tests.
- **N3** `config.ts:12` `HOST=` empty binds all interfaces — `.trim().min(1)` or map empty→default; test.
- **N4** SPEC §2.3 doesn't list 404 `not_found` / 414 `invalid_request` (spec-architect).
- **N5** `openai-adapter.ts:164/172` body() should reuse sendsReasoning().
- **N6** `prompt.ts:69` Cc/Cf strip side effects (BOM→space, NEL/separators deleted); update doc comment.
- **N7** `infra/id-key.ts:5` collision comment wrong (2^-128 per pair, 2^-64 birthday); 128 bits fine.
- **N8** `test/audit-fixes.test.ts:27-29` wall-clock assertion; add `buildUserBlock` not containing chunk_id.
- **N9** S-08 and S-04(b) deferrals + rate-limit request need TASKS lines.
- **N10** optional HOST default `localhost` binds 127.0.0.1 and ::1.

## Rate-limit opinion
Leaving it unimplemented is acceptable with the loopback default, provided docs state `HOST=0.0.0.0` exposes an unauthenticated, unrate-limited API and global WS broadcast, and TASKS records the deferral. If ever added: limit only non-loopback addresses and answer over-limit with a 200 heuristic result (never 429); needs an ADR + human approval.

## Checklist — 1–10 PASS (security PASS with N3)
