# S6c review r2 — APPROVE

> Written by code-reviewer (read-only); saved by the orchestrator.

Reviewer checks: frontend vitest 41/41; frontend typecheck (both configs), eslint, prettier clean. Root lint red only from backend-dev's in-progress S3 files (out of slice).

## Resolved
- **B1** `socket.ts` — bare `onopen` no longer resets backoff (112-116); reset only on valid `hello` (119) or 5 s stable open (115); timer cleared on close/stop (88, 128); `onclose({code})` (54); 1008 final → `rejected` "WS: offline (origin rejected)" (90-94, Header.tsx:8). Tests: storm delays 500→8000 capped; hello/stable-open reset; 1008 no reconnect after 60 s. Handshake rejection (1006) backs off to offline after 3 failures.
- **B2** `store.ts` — `chooseActive` (68-72) switches only when nothing shown or shown session idle ≥ 10 s (newest `received_at` or later `pinnedAt`); duplicates never switch (58); clock injected (useTelemetry.ts:76). Demo gaps ≤ ~6 s so no takeover during demo. Tests at store.test.ts:52-93 incl. exact 10 s boundary.
- **r1 N1** `prune` (74-86): shown session + ≤ 5 others by recency; tested.

## Non-blocking (new)
- **N1** `socket.ts:119` — hello-then-close crash loop still retries every 0.5 s; reset only if open ≥ ~1 s after hello.
- **N2** docs: "view follows newest session after 10 s of quiet".
- **N3** no `.ws-rejected` style (text + symbol suffice); screenshot not retaken (logic-only change).
Carried r1 N2–N9, N11, N12 still open (excerpt word boundary, 1 s tick re-render, bytes vs chars naming, react-hooks lint, live-region announcement, hook wiring tests, sleep listener, manual offline check, p50 "(last 20)").

## Checklist
1–10 PASS (6 N/A). S6c acceptance criteria met: WS client (storm-safe backoff, validated frames, merged store), header, Play demo. Real WS e2e pending S7a — see `.agent-work/requests/s7a-ws-client-contract.md`.
