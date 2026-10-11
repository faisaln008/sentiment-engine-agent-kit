# S6c review r1 — REQUEST_CHANGES

> Written by code-reviewer (read-only); saved by the orchestrator.

Reviewer checks: frontend vitest 34/34; frontend typecheck (both configs), eslint, prettier clean; no innerHTML, no console.log.

## Blocking
- **B1** `apps/frontend/src/lib/socket.ts:101-104,110` — reconnect storm when server accepts then closes (e.g. origin rejected with 1008 after upgrade): `onopen` resets `attempt=0` and status `live`; `onclose` ignores code → retry every ~0.5 s forever, header flickers live/reconnecting. Fix: reset `attempt` only after a valid `hello` frame or ≥ ~5 s stable open; add `code` to `WebSocketLike.onclose`; treat 1008 as final (`offline`, "origin rejected") or jump to the 8 s cap. Tests: repeated open→close still grows delays (500, 1000, 2000…); 1008 handling.
- **B2** `apps/frontend/src/lib/store.ts:21-22,52` — view locks to first session ever seen; SPEC §10 says header shows the most recent session. A second `npm run simulate` never appears without reload; an eval/bench session seen first holds the view. Fix (keeps no-takeover): follow a new session only when the pinned session has been idle ≥ ~10 s (track last `received_at` per session) or nothing is pinned; Play demo still pins. Tests: interleaved s2 frames don't switch while s1 active; after s1 idle ≥ 10 s, new s2 frame switches.

## Non-blocking
- **N1** `store.ts:50-53` — unbounded session retention; keep pinned + LRU of ~5.
- **N2** `useTelemetry.ts:65` — POST excerpt `slice(0,80)` can split words/surrogates and wins over WS word-boundary excerpt.
- **N3** `App.tsx:17` — 1 s tick re-renders whole App; move hook into `VolatilityAlert` or memo the stream.
- **N4** `socket.ts:9` — `WS_MAX_MESSAGE_BYTES` compares UTF-16 length; rename/comment.
- **N5** `useVolatility.ts:9-19` — effect deps; consider eslint-plugin-react-hooks (needs justification).
- **N6** `TrafficLight.tsx:15-18` — non-critical levels: a persistent polite live region announces more reliably.
- **N7** hook wiring untested (demo cadence, abort, POST/WS merge); extract `runDemo(reqs, send, sleep, signal)`.
- **N8** `useDemo.ts:8` — remove abort listener when timer fires.
- **N9** manually confirm the header reaches "offline (POST only)" against the reference.
- **N10** banner is the only place transcript text appears (stream shows hidden_intent only) — acceptable for a local UI; S7a broadcasting excerpts from all sessions → security-auditor.
- **N11** `Header.tsx:28` — add "(last 20)" to Server p50.
- **N12** `socket.ts:72` cast acceptable; update with B1 signature.

## S7a must match (also in .agent-work/requests/s7a-ws-client-contract.md)
See request file.

## Checklist
1 Lanes PASS · 2 Contract PASS · 3 Boundaries PASS · 4 Async FAIL (B1) · 5 Failure modes PASS (open→close missing) · 6 Latency N/A · 7 Tests PASS w/ gaps (N7) · 8 Types PASS · 9 Security PASS · 10 Simplicity PASS
S6b-r1 N1–N9 and S6a-r1 N7 DONE (N2 over-applied → B2). AC: WS met except B1; header met but session deviates (B2); demo met.
