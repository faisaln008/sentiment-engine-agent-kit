# ADR-002: npm-workspaces monorepo with shared zod contracts
Date: 2026-10-11 · Status: accepted (contract FROZEN 2026-10-11; id limit 512 per human decision Q7)

## Context
Backend (Fastify) and frontend (Vite/React) must agree on one wire format; the response must be schema-valid
on every path (LLM, fallback, heuristic). The brief requires `npm install` / `npm start` / `npm run dev:frontend`
from the repo root. Architecture is 25% of the score ("typed contracts").

## Options considered
| Option | Pros | Cons |
|---|---|---|
| A. Two separate projects, hand-copied TS types | Simple | Drift; no runtime validation |
| B. OpenAPI spec + codegen | Language-neutral | Codegen toolchain, slower iteration, overkill for 4 endpoints |
| **C. npm workspaces + `packages/contracts` (zod schemas + inferred types)** | One source; runtime validation on both sides; zero extra tooling | Contracts must be built before backend start (`npm start` builds it) |
| D. tRPC | End-to-end types | Changes the public HTTP contract shape; harness speaks plain JSON |

## Decision
**C.** `packages/contracts/src/{telemetry.ts, ws.ts, index.ts}` exports zod schemas, inferred types, enums,
limits and `withAcousticDefaults`. Backend parses input with `TelemetryRequestSchema` and **parses its own output** with
`TelemetryResponseSchema` before sending. Frontend validates every POST response and WS frame with the same schemas.
Frontend imports only `@app/contracts`. Zod is the single runtime dependency of the contracts package.
Contracts target **zod 4** (`z.strictObject`, `z.preprocess`; `zod: ^4.0.0` in `packages/contracts/package.json`). Two request schemas: lenient `TelemetryRequestSchema` (server) and strict `TelemetryRequestWireSchema` (clients build payloads with precise types).
`packages/contracts/{package.json,tsconfig.json}` written by spec-architect (CLAUDE.md §7 pre-freeze ownership): `@app/contracts`, ESM, exports map → `dist/`, `tsconfig` `composite: true` so root `tsc -b` can reference it.

## Evidence
Brief requires Node/TS strict + root-level commands (docs/assignment/README.md, not committed). Reference backend
shapes (`/health`, summary) read from `docs/assignment/reference-backend/index.js` on 2026-10-11.

## Consequences
- Contract changes after freeze need an ADR + human approval; backend/frontend agents file `.agent-work/requests/contract-change-<n>.md`.
- Consumers resolve `@app/contracts` to `dist/` → contracts must be built before backend tests/typecheck (`tsc -b` handles it via project references; vitest may alias to `src/` — S0 decides).
- Frontend (Vite, `noEmit`) cannot be a composite project reference as-is; S6a re-adds it to root `typecheck` with its own `tsc --noEmit -p apps/frontend` (or a composite config), not via `tsc -b`.
- Output schema is `.strict()`: any accidental extra key fails backend tests early rather than at the harness.
