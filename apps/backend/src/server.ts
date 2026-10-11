import { fileURLToPath } from 'node:url';
import { buildApp } from './app.js';
import { loadConfig } from './config.js';
import { createKeepAliveFetch } from './infra/http-agent.js';
import { loadEnv } from './infra/env.js';
import { buildChain } from './llm/build-chain.js';
import { SessionStore } from './session/session-store.js';

// Repo root is three levels up from both src/ and dist/ (apps/backend/{src,dist}/server.*).
loadEnv(fileURLToPath(new URL('../../../.env', import.meta.url)));

const config = loadConfig();
// `app` is created below; these loggers are only called after boot, so the late binding is safe.
const log = {
  warn: (o: object, m: string): void => app.log.warn(o, m),
  info: (o: object, m: string): void => app.log.info(o, m),
};

const { chain, providers } = buildChain(config, createKeepAliveFetch(), log, {
  onDisabled: (provider, status) =>
    app.log.warn({ provider, status }, 'provider disabled after auth error'),
  onBreakerOpen: (provider, info) => app.log.warn({ provider, ...info }, 'circuit breaker opened'),
  // Every failed attempt, even when a later provider answers (no text, no keys, no provider bodies).
  onAttemptFailed: (f) =>
    app.log.info(
      {
        provider: f.provider,
        reason: f.reason,
        ...(f.status === undefined ? {} : { status: f.status }),
        ...(f.finishReason === undefined ? {} : { finish_reason: f.finishReason }),
        ...(f.limit === undefined ? {} : { limit: f.limit }),
        ...(f.retryAfterMs === undefined ? {} : { retry_after_ms: f.retryAfterMs }),
        latency_ms: Math.round(f.ms),
      },
      'llm attempt failed',
    ),
});

const sessions = new SessionStore({
  maxSessions: config.MAX_SESSIONS,
  ttlMs: config.SESSION_TTL_MS,
  contextTurns: config.CONTEXT_TURNS,
});
sessions.start();

const app = buildApp(config, {
  sessions,
  ...(chain === null ? {} : { classifier: chain }),
  mode: () => (chain === null ? 'heuristic' : chain.mode()),
});
await app.listen({ port: config.PORT, host: '0.0.0.0' });
// Non-blocking: pays DNS/TLS before the first scored chunk. Results are logged, never awaited.
for (const p of providers) void p.warmUp();
