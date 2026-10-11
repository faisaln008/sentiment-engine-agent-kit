# backend-dev S0 handoff
## Changed
Created: apps/backend/{package.json,tsconfig.json,src/{config,app,server}.ts,test/config.test.ts}, root tsconfig.json (solution refs), vitest.config.ts, eslint.config.js (flat), .prettierrc.json, .prettierignore. Root package.json: typecheck now `tsc -b packages/contracts apps/backend` (frontend excluded until S6a) + devDependencies. Existing .gitignore already covers required entries (node_modules, dist, *.tsbuildinfo, .env, .env.*, !.env.example, coverage, docs/assignment/).
Stubs eval/eval:smoke/bench/simulate print `not implemented (S2)` exit 0; nothing created under apps/backend/eval.
config.ts: zod, exactly the .env.example vars, defaults, never throws on missing keys.
## Deps (justification)
Runtime: fastify (HTTP server, per CLAUDE.md), zod (config + contracts, already contracts dep), @app/contracts (workspace).
Dev: typescript, vitest (tests), tsx (dev watch), eslint + typescript-eslint (flat lint), prettier, @types/node.
## Verified
`npm run gate`: PASS typecheck, PASS lint, PASS test (3 tests), eval/bench SKIPPED (backend not on :3000). contracts built unchanged.
## Risks
- Prettier ignores packages/contracts, scripts/, *.md (contracts/scripts not Prettier-formatted; not editable by me for contracts).
- vitest installed as 3.2.7 resolved; fine.
- app.ts /health is a placeholder; real one in S1a.

## Fix loop 1 (B1: dotenv loading)
- Added apps/backend/src/infra/env.ts `loadEnv(path)` (existsSync guard, then process.loadEnvFile); server.ts calls it before loadConfig(), path resolved from import.meta.url (three levels up, identical from src/ and dist/).
- engines.node raised to >=20.12 (root package.json is the only declaration).
- Test apps/backend/test/env.test.ts: file values load, pre-set shell var wins over file (verified on Node v22.16.0), missing file returns false without throwing.
- Gate: typecheck/lint/test PASS, eval/bench SKIPPED.
