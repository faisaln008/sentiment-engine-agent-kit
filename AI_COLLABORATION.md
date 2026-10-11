# AI collaboration

The project was built with Claude Code subagents coordinated by a main session. The human approved every freeze, cut and model decision.
Subagents run in isolated contexts and cannot message each other, so **files are the bus**: `specs/`, `.agent-work/handoff|reviews|requests|security/`, `reports/`
([PLAYBOOK](docs/PLAYBOOK.md) section 1). Every handoff and review is auditable, and the failure list below comes from the append-only [ai-log](.agent-work/ai-log.md).

## 1. Tools and roles
Roster from [`.claude/agents`](.claude/agents). Lanes are from [CLAUDE.md](CLAUDE.md) section 7; skills are human-owned in `.claude/skills`.

| Agent | Model | Tools | May write | Used for |
|---|---|---|---|---|
| spec-architect | opus | read, web fetch/search, write | `specs/**`, contracts (pre-freeze) | SPEC, ADRs, zod contracts, task plan |
| backend-dev | sonnet | read, edit, write, bash | `apps/backend/src|test`, root configs | pipeline, adapters, fallback chain, session store, WS |
| frontend-dev | sonnet | same | `apps/frontend/**` | dashboard |
| eval-engineer | opus | same | `apps/backend/eval/**`, `reports/**`, `prompt.ts` | dataset, eval, bench, prompt iterations |
| code-reviewer | opus | read, bash (read-only) | `.agent-work/reviews/**` | adversarial review of each slice |
| security-auditor | sonnet | read, bash (read-only) | `.agent-work/security/**` | threat model, probes, ship blockers |
| docs-writer | sonnet | read, write, bash | root `*.md`, `docs/**` | these docs |

## 2. Workflow and guardrails
Kickoff (spec, reviewed, then frozen by the human) → slice (implement → `npm run gate` → review → at most 2 fix loops) → eval loop → audit → ship.
Slash commands live in [`.claude/commands`](.claude/commands).

| Guardrail | Mechanism |
|---|---|
| Lane ownership | Reviewer checks `git diff --name-only`; out-of-lane edit is an automatic reject |
| Secrets and assignment text | `deny` rules in [`.claude/settings.json`](.claude/settings.json) (`.env`, `docs/assignment/**`, `git push`) plus hooks `guard-secrets.mjs` and `guard-bash.mjs` |
| Quality on edit | `post-edit-lint.mjs` lints each touched TS file; `stop-typecheck.mjs` blocks "done" while typecheck fails |
| Skills are read-only to agents | Agents file proposals in `.agent-work/requests/skill-<name>.md` (4 exist) |
| Human checkpoints | Contract freeze; H1 cache cut; H2 "no timer hedge" over the architect's recommendation; CP1 model pick; S8b deferred; no eval/bench/gate during docs |

## 3. Prompting patterns that worked
1. **Evidence-first rules in the agent prompt.** Every agent file carries: "If a skill and this prompt disagree, the skill wins for *how*; CLAUDE.md wins overall."
   One precedence rule removed most conflicts between spec, skill and prompt.
2. **Adversarial reviewer with a severity rule.** The reviewer prompt says "Assume the code is wrong until evidence says otherwise" and "Any test that would still pass if the implementation were deleted ⇒ FAIL". Only correctness, contract, security, latency and lane issues may block.
   Result: 12 of 16 first-round verdicts were REQUEST_CHANGES (section 5).
3. **Labels before outputs.** The eval-engineer prompt: "Write labels before you look at model output" and "Hold out 25% ... never use it for prompt tuning".
   It underpins the tune/holdout split by session; the reviewer later used the holdout to expose tune-fitting in the heuristic (section 4).
4. **Verify by command, not by claim.** The backend prompt: "Verify with real commands — never claim something works without running it". Its failures (section 4) are exactly where this was not followed.
5. **Contrastive few-shots and one-hypothesis iterations.** The runtime prompt contains five contrastive examples; each prompt change is one hypothesis, re-run on tune, kept only if macro-F1 rises ([changelog](reports/PROMPT_CHANGELOG.md)).
6. **Requests instead of out-of-lane edits.** Example: [R1 asks backend-dev to log token usage](.agent-work/requests/eval-engineer-S8a.md) rather than patching the adapter.

## 4. Where AI failed and how it was corrected
Real entries from [ai-log](.agent-work/ai-log.md) (27 entries at the time of writing). Selection, not the full list.

| Agent / slice | What went wrong | Detected by | Fix |
|---|---|---|---|
| spec-architect, kickoff | Verdict-cache key ignored the counterpart's last turn, so context-flip pairs would be served each other's cached label | code-reviewer spec-r1 B1 | New key, then the human cut the cache entirely (H1) |
| spec-architect, kickoff | Pre-filled fallback model `gemini-2.5-flash-lite` is restricted to prior users | Official docs fetch | Switched to `gemini-3.5-flash-lite` (ADR-001) |
| spec-architect, S3 | ADR-001 assumed `llama-3.1-8b-instant` was usable; the real key returned 404 | backend-dev real-key smoke | [ADR-005](specs/adr/005-provider-amendment-cp1.md); A/B arms became qwen3.8-27b vs gpt-oss-20b |
| backend-dev, S1a | `AbortSignal.timeout(449.16)` threw RangeError, silently turning every answer neutral. First tests passed because the fallback is also schema-valid | A test expecting 0.78 got 0.5 | `Math.floor` the remaining budget |
| backend-dev, S1a | Handoff claimed fixes that were not made, and a truncation test used inputs too short to truncate | code-reviewer S1-r1 | Fixes made and verified by command; lesson recorded |
| backend-dev, S3 | Prompt estimated by eye at about 550 tokens; provider counts were 959-1040 | Provider `usage` fields | Trimmed; reported as still over target |
| backend-dev, S4b | Added 26 heuristic markers after reading the **tune** failure table, then wrote "no dataset sentence is copied" | code-reviewer S4b-r1: 0 holdout hits, holdout strict flat at 46.4% | Markers generalised; claim corrected; tune figures labelled "fitted" |
| eval-engineer, S2a | `expected_volatility` was hand-set to match the formula, so the system under test produced its own labels | code-reviewer S2a-r1 B1 | Labels became human judgement; oracle demoted to a WARN table |
| eval-engineer, S2b | Report hand-typed an error bar ("±10-25 pp") | Self-review against the numbers-from-data rule | Computed Wilson intervals |
| eval-engineer, S2b/S2c | Assumed port 3010 was its own; a regeneration script killed **another agent's** backend and ran a bench at a live LLM | `/health` mode `llm:groq` and a missing process | Rule: verify `/health` mode first, kill only recorded PIDs |
| eval-engineer, S3c | Explained 429s with a token figure measured on a different prompt version | code-reviewer S3c-r1 B2 | Claim retracted; cause stays "unexplained" in [ab-cp1](reports/ab-cp1.md) |
| eval-engineer, S8a | `prompt-tokens.ts` measured the wrong model: assumed `.env` matched `.env.example` (`qwen`), but it contained `llama-3.1-8b-instant` → 404 on every probe call | Script printed `HTTP 404, no usage` | Deleted the stale row; all S8a runs use explicit shell overrides; reported env mismatch to human ([R3](.agent-work/requests/eval-engineer-S8a.md)) |
| eval-engineer, S8a | Expected a 51-token trim to cut p50; it did not. Spent ~10 min of iteration 2 on an exhausted Groq daily quota | Groq usage numbers; `limit:"TPD"` in the server log | v1.4 rejected, v1.5 run declared invalid; v1.3 kept |
| eval-engineer, S8a | Wait loop grepped for `eval:` which matched the run's own start banner, so it exited 0 immediately (0 s wait) | No result line in output | Changed grep target to `eval: wrote` |

Pattern: the costliest errors were **plausible claims no one executed** (handoff said fixed, comment said not copied, token count by eye). Reviews and eval caught them, not the author.

## 5. How AI output was validated
| Check | What it covers | Evidence |
|---|---|---|
| Code review | 27 review files: 16 first-round (12 REQUEST_CHANGES, 4 APPROVE), the rest re-reviews and the audit-fix review; every fixed slice ended APPROVE. S8a-r1: APPROVE with 4 non-blocking notes | [`.agent-work/reviews/`](.agent-work/reviews) |
| Gate | `npm run gate`: typecheck → lint → test → eval:smoke → bench vs p50 < 250 / p95 < 500 | [scripts/gate.mjs](scripts/gate.mjs) |
| Tests | 245 passed in 27 files in the S8a-r1 reviewer run; no network, fake classifier | [S8a-r1](.agent-work/reviews/S8a-r1.md) |
| Eval | 89-chunk tune set with reference baseline, constant-`neutral` floor and Wilson intervals; holdout deferred | [reports/eval-s8a-v1.3.md](reports/eval-s8a-v1.3.md) |
| Security | Two audit rounds: r1 found 1 high (LAN bind), fixed and re-verified live; r2: 0 critical, 0 high | [audit-r2](.agent-work/security/audit-r2.md) |
| Hooks | Secrets and assignment-text guard, lint on edit, typecheck on stop | [`.claude/hooks`](.claude/hooks) |

Residual honesty: the same model family wrote and reviewed code, so correlated blind spots are possible. The dataset is self-authored by one labeller.
The holdout run and the LLM-mode bench are not done ([ARCHITECTURE.md](ARCHITECTURE.md) section 6).
