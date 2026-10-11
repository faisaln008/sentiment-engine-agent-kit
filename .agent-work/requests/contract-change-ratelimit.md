# Request: per-IP rate limit on POST /api/telemetry/stream (audit S-03) — NOT implemented, needs a decision

From backend-dev. Audit S-03 asks for a dependency-free per-IP fixed-window limiter returning 429 `{error:"rate_limited"}`.
I did NOT implement it because it conflicts with the frozen contract and the scoring risk:
- SPEC §2.3 / api-contract skill: the stream endpoint returns 200 for everything except 400 (bad ids/text), 413; "No 5xx caused by the LLM path, ever". A 429 on our own API is a new status outside that set.
- The scoring harness likely posts from one IP (localhost) and may burst. Any limiter that can fire turns a scored chunk into a non-200, which is strictly worse than a heuristic answer. A limit high enough never to fire in the harness (e.g. 600/min) is also too high to stop the flood described in S-03 at heuristic speed.
Implemented instead (no contract impact): `connectionTimeout` 60 s, `requestTimeout` 15 s, `keepAliveTimeout` 30 s; loopback bind by default (S-01); hashed idempotency ids (S-02, removes the OOM path); the in-flight cap per provider already bounds LLM concurrency.
Options for the human / spec-architect: (a) accept the residual risk (loopback default makes the flood a local-only issue); (b) approve a 429 for non-loopback remote addresses only, loopback exempt (harness safe, LAN opt-in protected); (c) answer an over-limit request with a 200 heuristic result instead of 429 (contract-safe, protects provider quota only). I recommend (b) or (c) if anything; default stays as is.
