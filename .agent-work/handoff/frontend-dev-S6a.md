# frontend-dev S6a handoff

## Changed (apps/frontend/** only)
- package.json, tsconfig.json (strict + noUncheckedIndexedAccess + exactOptionalPropertyTypes; noEmit; `paths` alias to contracts src), vite.config.ts, index.html
- vite.config.ts: alias `@app/contracts` -> contracts src (fresh clone builds with no contracts build); proxy `/api`, `/health`, `/ws` (ws:true) -> `VITE_API_TARGET` (default http://localhost:3000); port 5173 strict
- src/lib/store.ts: pure immutable store, newest first, dedupe by chunk_id (duplicate enriches speaker/excerpt, never reorders), ring buffer 200/session
- src/lib/api.ts: `postChunk` POST via proxy, validates with `TelemetryResponseSchema` (strict), drops+warns invalid/non-2xx
- src/hooks/useTelemetry.ts: `{state, send(req: TelemetryRequestWire), push(item)}`; `push` is the entry for the WS path in S6c
- src/App.tsx: placeholder shell (button + list) to prove data path; real widgets in S6b

## Dependencies (root package-lock updated by `npm install`; root package.json untouched)
- react, react-dom: UI. @vitejs/plugin-react: JSX/refresh. vite (already in tree, 7.3). @types/react, @types/react-dom: types.
- zod: declared because contracts imports it and Vite bundles contracts source (same version as contracts).

## Verified
- `npm run -w apps/frontend build` OK (tsc + vite build; rollup comment warnings from zod are harmless)
- `npm run -w apps/frontend typecheck` OK; eslint --max-warnings=0 and prettier --check on apps/frontend clean
- Reference: :3001 was not up, so I started it, ran Vite (5173) with VITE_API_TARGET=http://localhost:3001, `curl POST localhost:5173/api/telemetry/stream` returned a valid 8-key response; `/health` proxied. Stopped both processes I started.
- Not done: browser-click of the sample button / screenshot (S6b).

## Open risks
- Root `typecheck` line NOT applied: see .agent-work/requests/root-typecheck-frontend.md (orchestrator to apply).
- Reference POST responses carry no session_id/speaker; hook takes them from the request. Duplicate WS frame after POST fills nothing new except missing fields.
- zod bundle adds ~300 kB (96 kB gzip) to the JS; acceptable for a local dashboard.
- Reference `mode` is "placeholder" (not matching OUR_HEALTH_MODE_RE): header in S6c must not validate mode strictly.
