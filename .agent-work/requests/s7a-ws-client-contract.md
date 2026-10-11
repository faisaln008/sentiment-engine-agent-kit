# What S7a (WS gateway) must match for the S6c client (from S6c-r1 review)

1. Path exactly `/ws/telemetry` (`WS_PATH`), reached via Vite `/ws` proxy (`ws:true, changeOrigin:true`). Browser `Origin` stays `http://localhost:5173`; allow-list must contain exactly that (CORS_ORIGIN default). `127.0.0.1:5173` is rejected (document).
2. Missing/mismatching `Origin` → close 1008 (SPEC) or reject at handshake (no 101). Client handles both after S6c B1 fix.
3. Text frames only: `socket.send(JSON.stringify(msg))`; never binary (dropped client-side).
4. `hello` on connect: `{type:"hello", mode}` with `mode` exactly the `/health` mode string.
5. `analysis` frames: `{type:"analysis", session_id, speaker:"candidate"|"counterpart" (normalised), text_excerpt (≤ 80, word-boundary cut), timestamp_ms:number, result}`; `result` exactly the 8-key strict `TelemetryResponseSchema` object (extra key ⇒ frame dropped); `result.chunk_id` equals the POSTed chunk_id. Build every frame with `ServerMessageSchema.parse` server-side.
6. Each frame ≤ 16 KB.
7. Server→client only: small inbound `maxPayload`, ignore/close on client messages; broadcast after commit; drop slow clients > 1 MB buffered.
8. e2e test: `Origin: http://localhost:5173` → `hello` then `analysis`.
9. Privacy: broadcasting excerpts from all sessions to all allowed-origin clients → flag for security-auditor.
