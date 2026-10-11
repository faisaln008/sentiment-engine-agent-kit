# Security audit r2 (backend-dev audit fixes, working tree, 2026-10-11)

Summary: 0 critical, 0 high, 1 medium (residual), 3 low. Offline probes re-run; app started once on PORT 3050 with blank keys and my own PID killed.

## Verification of r1 findings

| ID | r1 | r2 | Evidence |
|---|---|---|---|
| S-01 | High | Resolved (Medium residual: WS broadcast still global; see R-1) | `config.ts:12` `HOST` default `127.0.0.1`; `server.ts:52` listens on `config.HOST`; `.env.example` documents 0.0.0.0 as opt-in. Real run: `lsof` shows `127.0.0.1:3050` only; `/health` via `127.0.0.1` ok; request to the LAN address refused. No other reference to 0.0.0.0 in scripts, eval, bench, Vite config (proxy target is `http://localhost:3000`, eval/bench default `http://localhost:3000`). |
| S-02 | Medium | Resolved -> Low | `session-store.ts:101-103` stores `idKey()` (22-char digest). Re-measured: 1.10 GB for 1000 full sessions, independent of id length and charset (was 2.9 GB, about 5.8 GB with non-Latin-1 ids), under the 4.35 GB heap. Lowering `MAX_IDS` to about 1000 would cut it further (optional). |
| S-03 | Medium | Partly resolved; re-rated Low, see below | `app.ts`: connectionTimeout 60 s, requestTimeout 15 s, keepAliveTimeout 30 s. No rate limiter. |
| S-04 | Medium | Unchanged (needs LLM run) | Defang probes still hold (12 payloads, 2-line prompt). Evaluation of injection-cases.jsonl against the LLM chain is still pending (eval-engineer). Not a code defect. |
| S-05 | Low | Resolved | `parse.ts:95` `Object.hasOwn`; `__proto__`/`constructor` now parse to null (bad_json, heuristic fallback) with no error-level log. Verified; legit synonyms still map. |
| S-06 | Low | Resolved | `infra/safe-error.ts`, used at `app.ts:62,119`: name + first line <= 100 chars, SyntaxError message omitted. |
| S-07 | Low | Resolved | `not_found` body verified (`{"error":"not_found"}`, no path); 414 returns `invalid_request` / `identifier too long` (82 bytes, no id echo). |
| S-08 | Low | Open | Provider still disabled for good after one 401/403 (not in this fix batch). |
| S-09 | Low | Resolved | `prompt.ts:69` strips `\p{Cf}` and `\p{Cc}`; NUL payload now yields `x y`. Whitespace controls become spaces; no delimiter or line escape in any payload. |
| S-10 | Low | Open, accepted | Dev-only (tinypool critical, @vitest/mocker moderate); prod audit 0. |
| S-11 | Low | Open (human) | `chmod 600` on the local dotenv file. |

## Re-rating S-03 and the missing rate limiter

With loopback as the default bind, the flood scenario needs a local process, or a deliberate `HOST=0.0.0.0` opt-in by the operator. Timeouts close the slow-request and idle-socket vectors. The remaining gap (a local or LAN client burning provider RPM/TPM) is Low: the in-flight cap (16/provider) plus circuit breaker already degrade to the heuristic and never produce a 5xx, and a 429 from our own API would violate the frozen contract and could fail a scored chunk (valid reason, as in `.agent-work/requests/contract-change-ratelimit.md`). Acceptable as a documented residual risk, with two conditions: docs-writer states in SETUP/ARCHITECTURE that there is no auth and no rate limit and that 0.0.0.0 must only be used on trusted networks; and a non-429 option (e.g. shedding to heuristic when a per-IP budget is exceeded, status still 200) stays on the backlog.

## Residual items

| ID | Sev | Item | Owner |
|---|---|---|---|
| R-1 | Medium (only when HOST is opened up) | WS broadcast is global and unauthenticated; `/summary` readable by session id; Origin check is browser-only. Safe at the loopback default; must be disclosed (T23). Not a ship blocker. | docs-writer |
| R-2 | Low | Loopback default can break a harness that reaches the server by non-loopback address or from another container. Node 20+ and curl handle `localhost` resolving to ::1 vs 127.0.0.1 (the server listens on IPv4 only); a client that tries only ::1 would fail. SETUP should say `HOST=0.0.0.0` is the switch for that case. | docs-writer |
| R-3 | Low | S-08, S-10, S-11 above; S-04 LLM-side injection evaluation pending. | backend-dev / eval-engineer / human |
