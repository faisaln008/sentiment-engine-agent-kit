# Setup

## Prerequisites
- Node >= 20.12 and npm ([package.json](package.json) `engines`).
- Optional: a free Groq key and/or a free Google AI Studio (Gemini) key. Without keys the server runs in heuristic mode.

## Run it

```bash
npm install
cp .env.example .env     # then edit .env if you have keys
npm start                # builds contracts + backend, listens on :3000
npm run dev:frontend     # second terminal: dashboard on :5173
npm run simulate         # third terminal: streams a demo negotiation to :3000
```

Check readiness: `curl -s localhost:3000/health` returns `{"status":"ok","mode":"...","version":"...","timestamp":...}`.
`mode` is `llm:<provider>` when a key is usable, else `heuristic`.

| Port | What | Change with |
|---|---|---|
| 3000 | Backend (HTTP + `WS /ws/telemetry`) | `PORT` in `.env` |
| 5173 | Dashboard (Vite dev server, proxies `/api` and `/ws` to :3000) | Vite config |
| 3001 | Reference backend, only for baseline evals | `npm run reference` |

## Keys (variable names are the ones in [.env.example](.env.example); never commit `.env`)

| Variable | Meaning |
|---|---|
| `LLM_PRIMARY_API_KEY` | Primary provider key. Default endpoint is Groq (`LLM_PRIMARY_BASE_URL`) |
| `LLM_PRIMARY_MODEL`, `LLM_PRIMARY_REASONING_EFFORT` | Default `qwen/qwen3.8-27b` with effort `none` |
| `LLM_FALLBACK_API_KEY` | Fallback key. Default endpoint is Gemini's OpenAI-compatible API |
| `LLM_FALLBACK_MODEL` | Default `gemini-3.5-flash-lite` |
| `LLM_DEADLINE_MS` | Hard deadline from request arrival; on expiry the heuristic answers (default 450) |

Free keys: Groq at <https://console.groq.com/keys>, Gemini at <https://aistudio.google.com/apikey>.
Set either, both, or neither. The chain skips a provider without a key.

**Model access differs per Groq org.** On the author's key `llama-3.1-8b-instant` returned 404 and
`qwen/qwen3.8-27b` worked ([ADR-005](specs/adr/005-provider-amendment-cp1.md)). Your key may differ.
If the primary model returns 404, requests fall back to Gemini or the heuristic. Alternatives to try:

| Model (Groq) | Settings | Evidence |
|---|---|---|
| `qwen/qwen3.8-27b` (default) | effort `none`. A Groq **Preview** model: may be discontinued at short notice, and not all Groq orgs can access it — if you see 404s, set `LLM_PRIMARY_MODEL` to one of the alternatives below | [reports/ab-cp1.md](reports/ab-cp1.md), TASKS T23 |
| `llama-3.1-8b-instant` | leave `LLM_PRIMARY_REASONING_EFFORT` empty (field omitted) | Not measured by us; 404 on the author's key |
| `openai/gpt-oss-20b` | effort `low` | **Not viable at `LLM_MAX_TOKENS` 90**: 85% of eval chunks fell back to the heuristic ([reports/ab-cp1.md](reports/ab-cp1.md)) |

Any OpenAI-compatible endpoint works for either role by changing `*_BASE_URL`, key and model (Cerebras and Ollama are listed in `.env.example`;
we did not test them: ADR-001 marks them UNVERIFIED).

### Ollama (local, no key)
Set `LLM_PRIMARY_BASE_URL=http://localhost:11434/v1`, `LLM_PRIMARY_API_KEY=` any non-empty string, `LLM_PRIMARY_MODEL=<your model>`, and
leave `LLM_PRIMARY_REASONING_EFFORT` empty. Untested by us. Small local models were rated "poor" on sarcasm in the ADR-001 option table, which is an expectation, not a measurement.

### No key: heuristic mode
The server logs one WARN and serves the rule-based classifier. Quality in this mode: tune macro-F1 0.52 but **fitted to the tune split**
([reports/eval-latest.md](reports/eval-latest.md)), and **it never detects sarcasm** (tune sarcastic F1 0.00 in the same report).

### Gemini-only deployments
Gemini `gemini-3.5-flash-lite` took 580-1170 ms per call on the author's machine ([ADR-005](specs/adr/005-provider-amendment-cp1.md)), above the default 450 ms deadline.
With only a Gemini key, most answers will be heuristic. Raising `LLM_DEADLINE_MS` lets Gemini answer, at the cost of p95 above the 500 ms budget (backlog item T14, [specs/TASKS.md](specs/TASKS.md)).

## Network exposure and security notes
- The server binds to `localhost` only (`HOST=localhost`). `HOST=0.0.0.0` is an explicit opt-in ([audit r2, R-2](.agent-work/security/audit-r2.md)).
  **Setting `HOST=0.0.0.0` exposes an unauthenticated, un-rate-limited API and a global WebSocket broadcast** (every connected
  allowed-origin client receives 80-character text excerpts from every session). Use it only on a trusted network,
  or if your harness reaches the server by a non-loopback address.
- The WebSocket (`WS /ws/telemetry`) broadcasts each committed chunk's `text_excerpt` (≤ 80 chars) to **all** clients whose
  `Origin` header matches `CORS_ORIGIN`; it is cross-session by design ([audit r2, R-1](.agent-work/security/audit-r2.md)).
- Request text is logged at `debug` only. Do not set `LOG_LEVEL=debug` on real negotiations.

## Commands (all exist in [package.json](package.json))

| Command | Purpose |
|---|---|
| `npm run dev` | Backend in watch mode |
| `npm run typecheck` / `npm run lint` / `npm test` | Static checks and tests (no network, fake classifier) |
| `npm run simulate` | Replays a demo negotiation to `--target` (default `http://localhost:3000`), flags `--speed`, `--session` |
| `npm run eval -- --target http://localhost:3000 --label ours` | Labelled eval on the tune split; writes `reports/eval-latest.md`. Flags: `--split tune\|holdout\|all` (holdout needs `--holdout-ok`), `--smoke`, `--tpm`, `--tokens-per-req`, `--rpm`, `--server-log <file>` |
| `npm run eval:smoke` | 15-chunk subset; fails below a lenient-accuracy threshold. A regression tripwire, not a quality claim |
| `npm run bench` | Latency bench (sequential and 20 concurrent sessions, plus cold boot); writes `reports/bench-latest.md`. `-- --quick` writes the gate's transient file instead |
| `npm run reference` | Serves the provided reference backend on :3001 for the baseline column. Needs the git-ignored `docs/assignment/` folder, so it only works in the author's checkout |
| `npm run gate` | typecheck, lint, test, then eval:smoke and bench if a backend answers `/health` ([scripts/gate.mjs](scripts/gate.mjs)) |

Eval and bench against a **live LLM** spend free-tier quota. Throttle with `--tpm` and `--tokens-per-req`
(S8a used 7000 and 913, giving 7 RPM). Pass `--server-log` with the server's JSON log to get the provider mix, timeouts and 429 counts in the report.

## Troubleshooting

| Symptom | Cause and fix |
|---|---|
| `/health` says `heuristic` | No usable key, or the key was rejected (401/403 disables a provider for the process lifetime). Check `.env`, restart |
| Many answers are heuristic with a key set | Deadline timeouts (`LLM_DEADLINE_MS` 450) or 429s. Eval/bench reports list both. A Groq **daily** token quota (TPD) was exhausted during S8a ([request R3](.agent-work/requests/eval-engineer-S8a.md)); retry-after was 216-337 s and the circuit breaker then skips Groq for 15 s windows |
| HTTP 429 in the server log | Provider limit, not ours. The endpoint still answers 200 via Gemini or heuristic. Lower the request rate or wait for the quota window |
| Primary model 404 | Your Groq org lacks the model. Set `LLM_PRIMARY_MODEL` (table above). Also check `.env` matches `.env.example`: on the author's machine a stale value (`llama-3.1-8b-instant`) made a plain `npm start` run Groq-less ([R3](.agent-work/requests/eval-engineer-S8a.md)) |
| Browser CORS error, or dashboard shows "WS: offline (origin rejected)" | `CORS_ORIGIN` must contain the page's exact origin (default `http://localhost:5173`); WS connections with a missing or wrong `Origin` are closed with code 1008 |
| `EADDRINUSE` on 3000 | Another process holds the port. Set `PORT`, or stop it by its PID. Do not kill by port |
| `curl localhost` refused from another host/container | Loopback bind. Set `HOST=0.0.0.0` knowingly (see above) |
