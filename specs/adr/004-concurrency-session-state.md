# ADR-004: Concurrency model and session state
Date: 2026-10-11 · Status: accepted (frozen with SPEC.md 2026-10-11; cache cut per H1)

## Context
The harness may stream many sessions concurrently and possibly several chunks of one session in parallel or out of
order. Context (last turns, speaker baselines) improves nuance, but serialising a session behind a 200 ms LLM call
would multiply latency. The reference backend uses an unbounded module-level `Map` (memory leak, no TTL).
No persistence is in scope.

## Options considered
| Option | Pros | Cons |
|---|---|---|
| A. Per-session mutex around the whole pipeline | Strict ordering; perfect context | Chunk N+1 waits for chunk N's LLM call → latency stacks under bursts |
| **B. Lock-free snapshot at arrival + ordered commit after response** | No added latency; Node single thread makes commit atomic | Concurrent chunks of one session don't see each other |
| C. External store (Redis) | Multi-instance | New infra; non-goal |

## Decision
**B.**
- `SessionStore` (in-memory, injected singleton from `server.ts`; no other module-level mutable state).
- Entry per `session_id`: `turns[]` (sorted by `timestamp_ms`, kept ≤ 200 compact records for the summary),
  `baselines: {candidate, counterpart}` (Welford stats), `lastSeenAt`.
- `snapshot(session_id)` is synchronous and returns an immutable copy: last `CONTEXT_TURNS` (3) turns (each ≤ 40 words) + baselines + previous chunk per speaker.
- `commit(...)` is synchronous and runs **in the same tick as `reply.send()`, immediately after it, with no `await` in between** (review N7) — no torn writes, and a chunk arriving right after the response already sees it. Insert by `timestamp_ms` (binary insert), so out-of-order arrivals end up ordered.
- **Summary counters** (review N6): `chunk_count`, `flagged_count`, per-sentiment counts and a bounded top-3 list of high/critical moments are updated incrementally on commit — never derived from the 200-record capped history.
- **Idempotency:** a per-session Set of committed `chunk_id`s (FIFO-capped at 5000) — duplicates are re-analysed and returned but not re-committed (no double count in baselines/counters).
- **Empty-text chunks:** committed to counters only; not to context turns or baselines.
- **Bounds:** `MAX_SESSIONS` (1000) LRU eviction + `SESSION_TTL_MS` (30 min) idle expiry swept lazily on access and by an unref'd interval timer. Evicted session ⇒ summary 404.
- **Verdict cache: CUT** (human decision H1, 2026-10-11). History: the skill's key (text + acoustics + own prev sentiment) ignored the counterpart's last turn, so context-flip pairs would be cross-served (review B1). The safe key `sha1(model + PROMPT_VERSION + full dynamic user block)` only hits on byte-identical replays, which the scored run is unlikely to contain — so the slice (former S7b), pipeline step 4 and `CACHE_SIZE` were removed. Re-introducing a cache needs a new ADR. The skill request `.agent-work/requests/skill-latency-engineering.md` stays filed for the record.
- WS broadcast is fire-and-forget after send; a slow WS client is dropped when its buffered amount exceeds 1 MB.

## Evidence
Reference backend `sessions = new Map()` with no eviction (docs/assignment/reference-backend/index.js, read 2026-10-11).
Latency-engineering skill: commit/broadcast off the hot path.

## Consequences
- Two chunks of the same session arriving within one LLM round trip are analysed with the same context — acceptable, documented.
- Memory upper bound ≈ MAX_SESSIONS × 200 records × ~0.5 KB ≈ 100 MB worst case; acceptable for a single-process demo, documented.
- Required test (S5b): 20 concurrent sessions × 10 chunks with distinct speakers/baselines → no field from session A appears in B's context or summary; `chunk_id` echo correct under 20 parallel requests.
- Single-process only; horizontal scaling would need sticky sessions or an external store (non-goal).
