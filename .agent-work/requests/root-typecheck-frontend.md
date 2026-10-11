# Request: re-add apps/frontend to root typecheck (from frontend-dev, S6a)

Replace the root `package.json` `typecheck` script with:

    "typecheck": "tsc -b packages/contracts apps/backend && tsc -p apps/backend/tsconfig.check.json && tsc --noEmit -p apps/frontend"

(`apps/frontend` is not a composite reference; its tsconfig is noEmit and maps `@app/contracts` to contracts source via `paths`, so it needs no prior contracts build.)

Also: `npm install` was run at root and updated `package-lock.json` (react, react-dom, @vitejs/plugin-react, @types/react*). Commit it.

ESLint: no change needed. Root config already lints .tsx via tseslint recommended. No react-hooks plugin is installed; optional later.
