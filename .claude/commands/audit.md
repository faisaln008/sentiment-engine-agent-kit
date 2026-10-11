---
description: Security + full-repo review before shipping; routes blocking findings to owner agents
---
1. Delegate to **security-auditor** (full scope). In parallel, delegate to **code-reviewer** for a whole-repo review (not just last diff) focusing on architecture boundaries and async correctness.
2. Merge both reports into `.agent-work/ship-blockers.md`: only critical/high security + blocking review items, each with owner agent.
3. For each blocker, delegate the fix to its owner agent, then re-run `npm run gate`.
4. Ask eval-engineer to add the auditor's prompt-injection cases to the dataset and confirm they do not flip risk to `low`.
5. Report remaining blockers (should be zero) and accepted risks with justification.
