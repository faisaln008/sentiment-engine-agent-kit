# backend-dev audit fixes (audit-r1)

| ID | Done | Notes |
|---|---|---|
| S-01 High | yes | `HOST` config (default `127.0.0.1`), `.env.example` comment (0.0.0.0 = explicit opt-in, exposes all sessions on the LAN); `server.ts` listens on it. Verified: listener is `127.0.0.1:3010`, LAN IP refused, `curl`/Node fetch via `localhost` and `127.0.0.1` work, Vite proxy + WS through `localhost:5173` -> `localhost:3010` still works (hello/analysis/summary), gate/eval/bench defaults (`http://localhost:3000`) unchanged and working. docs-writer must disclose the bind default and the global broadcast in SETUP/ARCHITECTURE. |
| S-02 | yes | `infra/id-key.ts`: first 16 bytes of SHA-1 as base64url (22 chars) replace the raw chunk_id in the FIFO set. Hot-path cost measured by test < 0.05 ms/call (about 1-2 us). Test `S-02`. |
| S-03 | partly | Timeouts: `connectionTimeout` 60 s, `requestTimeout` 15 s, `keepAliveTimeout` 30 s. **Rate limiter NOT implemented**: a 429 on our own API is outside the frozen error set and could fail a scored chunk; request filed `.agent-work/requests/contract-change-ratelimit.md` with options. |
| S-05 | yes | enum synonym lookup uses `Object.hasOwn`; `__proto__`/`constructor`/`toString` -> `bad_json` (test). |
| S-06/T17 | yes | `infra/safe-error.ts`: name + first line <= 100 chars; SyntaxError messages omitted. Used by the error handler and the swallowed-exception log (test proves a quoted secret never appears). Emergency path provider label was already `none`. |
| S-07 | yes | `setNotFoundHandler` -> `{error:"not_found"}`; `frameworkErrors` maps router 414/bad URL to `{error:"invalid_request", issues}` without echoing the path or id (test with a 7000-char id). |
| S-09 | yes | defang strips `\p{Cf}` and `\p{Cc}` (whitespace controls become spaces) (test). |
| S-10 | no | `npm audit`: prod 0 vulnerabilities. Dev advisories (tinypool critical, @vitest/mocker moderate) only fix with `npm audit fix --force` = vitest 5 (major), so skipped as instructed; test tooling only, not shipped. |
| T24 | yes | `gate.mjs` now p50 < 250 and p95 < 500 (strict). |
| T22 | yes | `or (we|i|you)` consequence needs a threat verb; reasoning-field retry only if an effort was actually sent; failed-attempt log carries `chunk_id`/`session_id` (via `ClassifyInput.meta`, never sent to a provider); heartbeat test on fake timers with an answering client (`gateway.onPong`). |

Verification: typecheck, lint, tests 241 (all pass), `GATE_TARGET=http://localhost:3010 npm run gate` on a heuristic server (own PID, no LLM calls) PASS; bench p50 1 ms, p95 3 ms, errors 0. `npm run build` + loopback/LAN check above. Vite dev server started and stopped by me (own PID).
