# Agent kit — how to use

1. Create the repo, copy this kit's contents into the root, `git init && git add -A && git commit -m "chore: agent kit"`.
2. Put the assignment brief at `docs/assignment/README.md` and the provided reference backend
   (`index.js`, `package.json`, `README.md`) at `docs/assignment/reference-backend/` (both git-ignored on purpose).
   Check: `npm run reference` → serves it on :3001.
3. `chmod +x .claude/hooks/*.mjs` (they're invoked via `node`, so this is optional).
4. Open Claude Code in the repo root → `/kickoff` → review → reply `FREEZE`.
5. Follow `docs/PLAYBOOK.md` §3: `/slice S0` … `/eval` … `/audit` … `/ship`.

Files
- `CLAUDE.md` — architecture, invariants, commands, ownership, DoD (read by every agent)
- `.claude/agents/` — spec-architect, backend-dev, frontend-dev, eval-engineer, code-reviewer, security-auditor, docs-writer
- `.claude/commands/` — kickoff, slice, eval, audit, ship (orchestration)
- `.claude/settings.json` + `.claude/hooks/` — permissions and guardrails (secrets, bash, lint-on-edit, typecheck-on-stop)
- `docs/PLAYBOOK.md` — 9h timeline, checkpoints, cut order, submission checklist, video outline
- `specs/templates/`, `apps/backend/eval/SCHEMA.md`, `.env.example`, `package.json`, `scripts/gate.mjs`

Delete this file before submitting (or keep it — it documents your AI-native workflow).
