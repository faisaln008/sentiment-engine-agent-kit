# frontend-dev S6c handoff

Screenshot: `.agent-work/handoff/frontend-dev-S6c-screenshot.png` (1280x800, headless Chrome, reference backend on :3001 which was already running, so I did not stop it; I stopped only my Vite). Shows header (session, "WS: reconnecting..." since the reference has no WS, mode "placeholder", server p50), amber "Recent spike 7s ago" banner after a calmer chunk with the light at LOW, and deduped previous suggestions. Age is inflated by headless virtual time.

## Changes (apps/frontend only)
- `lib/socket.ts`: pure `frameToEvent` (string-only, <=16 KB, JSON, `ServerMessageSchema`; drops+warns else), `backoffMs` (0.5 s doubling to 8 s cap, +-25% jitter), `connectSocket` (reconnect loop, status connecting/live/reconnecting/offline = 3 failures without ever opening, closes cleanly), injectable WebSocket/random/clock.
- `hooks/useTelemetry.ts`: owns WS + POST + `/health` mode. Returns `{state, ws, mode, send, pin}`; no raw `push` anymore, so nothing unvalidated reaches the store. `mode` free text (WS hello wins, else /health; OUR_HEALTH_MODE_RE not used).
- `lib/store.ts`: `received_at` on items; `activeSessionId` is pinned = first session seen, changed only by `pinSession`; never follows last-ingested. Other sessions are stored but not shown.
- `hooks/useDemo.ts`: Play demo pins its fresh session, 1-3 s abortable gaps, aborts in-flight POST/timers on unmount; autostart only for `?demo=fast`, deferred with setTimeout(0) so StrictMode's mount/unmount/mount sends nothing extra.
- `lib/volatility.ts` (pure, `now` injected) + `hooks/useVolatility.ts` (1 s tick only while inside the window): banner shows trigger text + age; amber "Recent spike" (role=status) once a calmer chunk follows, red role=alert while the newest chunk is volatile; clears at 8 s. Keyed per pinned session by item `received_at`, so session switches/other sessions cannot re-arm it.
- `lib/risk.ts` (`RISK_META`), TrafficLight remounts via `key` so critical's role=alert is announced fresh. `lib/mitigation.ts` dedupes history. `lib/stats.ts` server p50 over last 20 items (header label "Server p50"). Mitigation: clipboard guard ("Copy unavailable"), timer cleanup.
- `components/Header.tsx`: session, WS state (symbol + text), mode, server p50, Play demo.
- S6b handoff contrast claim corrected to the measured 5.86:1 lowest pair.

## Tests (root vitest 75/75; frontend 34)
store (pinning), api, logic (volatility decay/restart/soften, RISK_META, mitigation dedupe, p50), socket (frame validation, backoff, connectSocket with fake WebSocket + fake timers: offline after 3 failures, backoff delays, live/reconnect, stop), demo (every payload parses with `TelemetryRequestWireSchema`, >= 8 chunks, one session, unique ids).
Typecheck (both configs), eslint --max-warnings=0, prettier, `npm run -w apps/frontend build` all pass.

## Risks / not verified
- Real WS never exercised against a server (S7a not present); only the fake-socket tests + reference showing reconnecting. Vite proxying ws to a real Fastify gateway untested; Origin check on the backend must accept `http://localhost:5173` (dev proxy uses changeOrigin; browser Origin stays 5173).
- Pinning means if a bench/simulate session is seen first, the UI shows it until Play demo is pressed (no selector, by cut).
- The useVolatility hook itself (interval) has no React-level test (no testing-library); its logic is the tested pure function.
- Critical state still not rendered with real data (reference never emits it).
- Root `typecheck` line still needs `npm run -w apps/frontend typecheck`.

## Fix loop 1 (S6c-r1 B1, B2)
- B1 `lib/socket.ts`: backoff `attempt` resets only on a valid `hello` frame or after 5 s of stable open (no longer on bare `onopen`), so accept-then-close storms keep growing 0.5, 1, 2, 4, 8 s. `WebSocketLike.onclose` now receives `{code}`; close code 1008 is final: status `rejected`, no reconnect, header "WS: offline (origin rejected)". Tests: storm delays, hello/stable reset, 1008 final.
- B2 `lib/store.ts`: view follows a newly seen session only if nothing is shown or the shown session has been idle >= `SESSION_IDLE_MS` (10 s; activity = newest item `received_at` or the last explicit pin time `pinnedAt`, measured against the incoming item's `received_at`). Duplicate chunks never switch. `pinSession(state, id, now)`; the clock comes from the dispatching hook (reducer stays pure). Play demo still pins explicitly. Tests: interleaved frames don't switch, idle takeover at exactly 10 s, pin counts as activity, duplicate no-switch.
- N1 folded in (trivial now): retains the shown session plus at most 5 most-recently-active others (`MAX_OTHER_SESSIONS`); tested.
- Verified: frontend typecheck (both configs), eslint --max-warnings=0, prettier, build OK; root `npx vitest run` 97/97.
- Not re-shot: screenshot unchanged by these fixes (logic only; one label added).
