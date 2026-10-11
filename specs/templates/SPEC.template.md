# SPEC — Sentiment Intelligence Engine
Status: DRAFT | FROZEN (date, by)

## 1. Scope & non-goals
## 2. API contract
### 2.1 POST /api/telemetry/stream — request (table: field, type, constraints)
### 2.2 Response (table) — incl. truncation rules for hidden_intent (60) / mitigation_suggestion (120)
### 2.3 Errors (400 shape), /health, WS /ws/telemetry message envelope
## 3. Label decision rules (shared verbatim with eval rubric + prompt)
| Label | Use when | Not when (nearest confusable) | Example (invented, not from brief) |
## 4. Acoustic features & per-speaker baseline
## 5. Volatility formula + threshold; risk-level floors/ceilings (deterministic fusion)
## 6. Context window & session state (K turns, TTL, max sessions, ordering)
## 7. Provider strategy, deadline, hedging, circuit breaker (link ADR-001)
## 8. Latency budget per stage (must sum ≤ 250 ms p50)
## 9. Failure modes table (trigger → behaviour → test name)
## 10. UI requirements (4 widgets + beyond)
## 11. Open questions (blocking? / recommended default)
## 12. Self-critique — 5 weakest points and mitigations
