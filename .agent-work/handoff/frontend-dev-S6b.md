# frontend-dev S6b handoff

Screenshot (1280x800, headless Chrome, reference backend, `/?demo=fast`): `.agent-work/handoff/frontend-dev-S6b-screenshot.png`. All four widgets visible, no page scroll (stream scrolls internally).

## Widgets (apps/frontend/src/components, styles.css)
- TrafficLight: colour + icon + text (LOW/MEDIUM/HIGH/CRITICAL), sentiment chip. Critical = `role=alert` + pulse (disabled under prefers-reduced-motion); others `role=status`.
- Mitigation: 28px current in `aria-live=polite`, 2 previous dimmed, Copy button (navigator.clipboard, "Copied" feedback).
- VolatilityAlert: `role=alert` banner while active; `useVolatilityActive` = 8 s after newest volatile chunk, restarted by a newer one. Fixed-height slot, so no layout jump.
- SentimentStream: newest first, time / You|Them / chip / confidence bar (role=img + aria-label) / hidden_intent / ms. Capped by the 200 store ring (not virtualised).
- All LLM strings are rendered as JSX text (no innerHTML).
- Dark theme only (fixed palette, light text on dark tints; measured lowest text pair is 5.86:1 (dimmed mitigation history); all pairs >= 4.5:1 per reviewer measurement).
- Minimal "Play demo" button + `?demo=fast|1` autostart are in (lib/demo.ts, 10 scripted chunks, 1-3 s gaps; `?demo=fast` has no gaps, used for the screenshot). S6c still owns header polish (connection, mode, p50), WS, and review of the demo.

## S6a review items
- N1 tests: `apps/frontend/test/store.test.ts` (6), `api.test.ts` (7; stubbed fetch: extra key, missing key, 500, non-JSON, chunk_id mismatch, network error -> null). Node env. `npx vitest run`: 54/54 pass overall.
- N2 `AbortSignal.timeout(3000)` (+ optional caller signal via AbortSignal.any). N3 chunk_id mismatch dropped+warned. N8 `crypto.randomUUID()` ids (demo.ts).
- N5 split: tsconfig.json (src, `vite/client` types only), tsconfig.node.json (vite.config + test, node types). `npm run -w apps/frontend typecheck` runs both. Root line should call that (see request file update); `tsc --noEmit -p apps/frontend` alone would skip vite.config and tests.
- N4/N6/N7/N9 deferred to S6c / docs (not touched).

## Verified
frontend typecheck OK, eslint --max-warnings=0 OK, prettier OK, `npm run -w apps/frontend build` OK, vitest 54/54. Reference :3001 was down so I started it; stopped it and Vite after. Chrome headless worked.

## Risks
- Reference backend returns latency 0 and `volatility_flag` per its own rules; critical state and pulse not exercised in the screenshot (reference never emitted critical in the demo). Style is simple CSS; verify visually with our backend.
- No stream virtualisation (<=200 rows, fine). Clipboard needs secure context (localhost OK).
- Alert/status `role` on the traffic light: a `role=status` region re-announces on text change; acceptable but not screen-reader tested.
