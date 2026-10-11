---
name: api-contract
description: The exact HTTP/WS contract for the Sentiment Intelligence Engine — request/response fields, enums, char limits, lenient input rules, /health and session-summary shapes, error format and reference-backend compatibility. Use when writing or reviewing zod schemas, routes, contract tests, frontend data handling or SETUP docs.
---

# API contract

Canonical code: `packages/contracts/src/telemetry.ts` (zod). This skill explains it; the code is the authority.

## POST /api/telemetry/stream
Request
| field | type | rule |
|---|---|---|
| chunk_id | string | required, 1–128 chars |
| session_id | string | required, 1–128 chars |
| timestamp_ms | number | integer; if missing use server time (log debug) |
| speaker | `"candidate"` \| `"counterpart"` | unknown value → treat as `counterpart`, log warn |
| text | string | required; trim; > MAX_TEXT_CHARS → truncate before prompt |
| acoustic_metadata | object | **optional/partial** — defaults: pitch_volatility 0.3, speech_rate_wpm = speaker baseline or 150, pause_duration_ms 300, volume_intensity 0.5; clamp floats to [0,1] |

Response (always all 8 keys)
| field | rule |
|---|---|
| chunk_id | echo request |
| processing_latency_ms | integer, `performance.now()` handler entry → before send |
| sentiment | `positive\|negative\|neutral\|sarcastic\|aggressive\|deflecting\|appeasement` |
| confidence | float 0–1, 2 decimals |
| volatility_flag | boolean |
| hidden_intent | string ≤ 60 (word-boundary truncate) |
| mitigation_suggestion | string ≤ 120 (word-boundary truncate) |
| risk_level | `low\|medium\|high\|critical` |

Errors: `400 {error:"invalid_request", issues:[{path,message}]}` only when chunk_id/session_id/text missing or wrong type.
Never 500 for LLM problems; never echo `text` in errors. Body limit 32 KB.

## GET /health
`{ status:"ok", mode:"llm:groq"|"llm:gemini"|"heuristic", version, timestamp }` — same shape as the reference backend.

## GET /api/telemetry/session/:sessionId/summary
`{ session_id, chunk_count, aggregated_volatility_score (0–1, 2dp), dominant_sentiment, top_risk_moments: [{chunk_id, timestamp_ms, sentiment, risk_level, text_excerpt(≤80)}] }`
Top 3 by risk desc, then recency. Unknown session → `404 {error:"session_not_found"}`.

## WS /ws/telemetry
Server → client: `{ type:"analysis", session_id, speaker, text_excerpt, result: <Response> }` and `{ type:"hello", mode }`.
Validate with the same zod schemas on the client. Max message 16 KB; check `Origin` against CORS_ORIGIN.

## Contract tests (must exist)
- reference-backend sample payload → 200 + schema-valid
- missing acoustic_metadata → 200; missing text → 400
- 61-char intent / 121-char mitigation from fake LLM → truncated
- `chunk_id` echoed under concurrency (20 parallel requests)
