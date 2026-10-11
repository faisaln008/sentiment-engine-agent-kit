# S6b review r1 — APPROVE

> Written by code-reviewer (read-only); saved by the orchestrator.

Reviewer checks: frontend typecheck (both configs) PASS; eslint --max-warnings=0 clean; prettier clean; vitest 8 files 54/54 (frontend 13); no innerHTML; screenshot 1280x800. Build per handoff/orchestrator.

## Blocking
none

## Non-blocking (carry into S6c)
- **N1** `hooks/useVolatility.ts:7-20`, `components/TrafficLight.tsx:3-18` — S6b logic untested (8 s decay, restart on newer volatile chunk, clear, risk→icon/label/role). Extract pure functions (`newestVolatileKey`, export `RISK_META`) and test with `vi.useFakeTimers()`; no new deps. Before S6c closes.
- **N2** `useVolatility.ts:8` — keyed on chunk_id within current session; switching `activeSessionId` (store.ts:50 = last-ingested) re-arms alert for an old chunk. With WS broadcasting all sessions, light/mitigation/alert will jump. Key on `session_id:chunk_id`, arm only on newly ingested volatile item, pin active session.
- **N3** `TrafficLight.tsx:17-22` — role changes on the same node; remount via `key` or render a separate `role="alert"` node for critical.
- **N4** `Mitigation.tsx:16` — guard `navigator.clipboard` (insecure context); clear the 1.5 s timeout on unmount.
- **N5** `Mitigation.tsx:12` — dedupe previous suggestions (screenshot repeats current).
- **N6** `App.tsx:32-38` — StrictMode double autostart sends a throwaway POST; `?demo=<anything>` autostarts; in-flight POSTs not aborted on unmount.
- **N7** Volatility banner while light says LOW follows the skill (per-chunk flag + 8 s client decay); screenshot exaggerates (fast demo ~1 s wall clock). UX suggestions: show trigger + age, or soften to amber "recent spike" after a calmer chunk; fixed copy competes with mitigation.
- **N8** Handoff claims contrast ≥ 7:1; measured lowest text pair is 5.86:1 (dimmed mitigation history). Correct the handoff; docs quote measured numbers.
- **N9** Demo arrived early (S6c scope) — acceptable; add a test that `TelemetryRequestWireSchema.parse` accepts every `buildDemoRequests()` item; review demo in S6c.
- **N10** Critical state not rendered; static check OK (#fff on #7a0c0c 11.14:1, outline, pulse disabled under reduced motion). Screenshot critical in S6c once fusion emits it.

## Measured contrast (WCAG 2.x)
body text 14.62 (panel) / 16.59 (bg); .dim 7.59 / 8.61; mitigation-prev 5.86 (lowest); .btn 10.19; risk none 11.75, low 8.93, medium 8.47, high 7.83, critical 11.14; alert banner 6.57; chips 8.35–9.43; conf fill vs track 6.04; focus ring 8.94. Nothing below 4.5:1.

## Checklist
1 Lanes PASS · 2 Contract PASS · 3 Boundaries PASS · 4 Async PASS (N4, N6) · 5 Failure modes PASS · 6 Latency N/A · 7 Tests PARTIAL (N1) · 8 Types PASS · 9 Security PASS · 10 Simplicity PASS

S6a carry-overs N1 (store/api), N2, N3, N5, N8 DONE. Root typecheck must call `npm run -w apps/frontend typecheck` (orchestrator). All S6b acceptance criteria met.
