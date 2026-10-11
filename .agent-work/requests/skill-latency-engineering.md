# Request: latency-engineering skill — cache key (from spec-architect, 2026-10-11, review spec-r1 B1)

**Current skill text:** "Cache key = sha1(normalised text + bucketed acoustics (0.1 steps) + prev sentiment of speaker)."

**Problem:** the label depends on context the key doesn't include — notably the *other* speaker's last turn
(nuance-taxonomy context rule: "Sounds great." after a price hike vs after a discount). Two chunks with identical text,
acoustics and own-previous-sentiment but different counterpart context would share a cached label, across sessions too.
Context-flip pairs in the eval dataset would be scored with the first cached answer.

**Proposed text:** "Cache key = sha1(model + PROMPT_VERSION + the full dynamic user block actually sent — context turns,
speaker, acoustic descriptors, text). Reuse only when the LLM input is byte-identical. Expect low hit rates outside replays;
report cache-on and cache-off separately."

**Consequence:** the cache becomes correct but rarely hits on novel traffic — which is why SPEC §11.2 H1 recommends cutting S7b.
