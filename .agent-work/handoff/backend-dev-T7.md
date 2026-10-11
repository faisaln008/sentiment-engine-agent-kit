# backend-dev T7 handoff
Changes: new `apps/backend/tsconfig.check.json` (noEmit, same strict flags, includes src+test+eval; non-composite so nothing reaches dist/). Root `typecheck` = `tsc -b packages/contracts apps/backend && tsc -p apps/backend/tsconfig.check.json` (build first so contracts d.ts exist; second pass is check-only).
Verified: typecheck clean (0 errors in test/ and eval/, so no fixes needed, no eval errors to route). Deliberate errors appended to test/truncate.test.ts and eval/validate-dataset.ts both failed typecheck (TS2322); reverted. dist/ has no test/eval output. `npm run gate`: typecheck, lint, test (41 pass) PASS; eval/bench skipped (backend not running).
Risks: none; src untouched. Note this check pass re-typechecks src (~1s).
