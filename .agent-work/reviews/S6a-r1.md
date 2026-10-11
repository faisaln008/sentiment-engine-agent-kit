# S6a review r1 — APPROVE

> Written by code-reviewer (read-only); saved by the orchestrator.

Checks (reviewer, read-only): `tsc --noEmit -p apps/frontend` OK; eslint --max-warnings=0 OK; prettier OK; vitest 41/41 (no frontend tests). Orchestrator: frontend build OK (96 kB gzip).

## Blocking
none

## Non-blocking (carry into S6b/S6c)
- **N1** `src/lib/store.ts:29-52`, `src/lib/api.ts:8-35` — no tests; root `vitest.config.ts:12` doesn't include `apps/frontend/test/**`. Add store tests (dedupe enrich keeps order, 201→200 drops oldest, per-session isolation, no mutation) and api tests with stubbed fetch (extra key / missing key / 500 / non-JSON → null). Before S6b closes.
- **N2** `useTelemetry.ts:25`, `api.ts:10` — no POST timeout; use `AbortSignal.timeout(3000)` (+ unmount via `AbortSignal.any`).
- **N3** `useTelemetry.ts:27-28` — warn and drop when `result.chunk_id !== req.chunk_id`.
- **N4** `vite.config.ts:5` — `process.env` only; use `loadEnv` or document shell-only; `VITE_API_TARGET` missing from root `.env.example` (request / SETUP).
- **N5** `tsconfig.json:9` — node types leak into browser src; split `tsconfig.node.json`.
- **N6** no `eslint-plugin-react-hooks` (request to backend-dev before S6c).
- **N7** `useTelemetry.ts:17,22` — `push` unvalidated; WS path must `ServerMessageSchema.safeParse` inside the hook.
- **N8** `App.tsx:10` — `Date.now()` ids collide; `crypto.randomUUID()`.
- **N9** bundle ~96 kB gzip (zod 4 classic) — note for docs.

## Checklist
1 Lanes PASS (lockfile adds only workspace install entries; root package.json via request) · 2 Contract PASS · 3 Boundaries PASS · 4 Async PASS w/ N2 · 5 Failure modes PASS in code / untested · 6 Latency N/A · 7 Tests FAIL non-blocking (N1) · 8 Types PASS · 9 Security PASS · 10 Simplicity PASS

All four acceptance criteria met; root typecheck line `tsc -b packages/contracts apps/backend && tsc -p apps/backend/tsconfig.check.json && tsc --noEmit -p apps/frontend` verified correct, to be applied by the orchestrator. Reference `mode:"placeholder"` handled by `HealthSchema.mode = z.string().min(1)`; S6c must not apply `OUR_HEALTH_MODE_RE`.
