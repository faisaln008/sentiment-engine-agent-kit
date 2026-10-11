import { fileURLToPath } from 'node:url';
import { buildApp } from './app.js';
import { loadConfig } from './config.js';
import { createKeepAliveFetch } from './infra/http-agent.js';
import { loadEnv } from './infra/env.js';
import { buildChain } from './llm/build-chain.js';

// Repo root is three levels up from both src/ and dist/ (apps/backend/{src,dist}/server.*).
loadEnv(fileURLToPath(new URL('../../../.env', import.meta.url)));

const config = loadConfig();
// `app` is created below; these loggers are only called after boot, so the late binding is safe.
const log = {
  warn: (o: object, m: string): void => app.log.warn(o, m),
  info: (o: object, m: string): void => app.log.info(o, m),
};

const { chain, providers } = buildChain(
  config,
  createKeepAliveFetch(),
  log,
  (provider, status) => app.log.warn({ provider, status }, 'provider disabled after auth error'),
  (provider, info) => app.log.warn({ provider, ...info }, 'circuit breaker opened'),
);

const app = buildApp(config, {
  ...(chain === null ? {} : { classifier: chain }),
  mode: () => (chain === null ? 'heuristic' : chain.mode()),
});
await app.listen({ port: config.PORT, host: '0.0.0.0' });
// Non-blocking: pays DNS/TLS before the first scored chunk. Results are logged, never awaited.
for (const p of providers) void p.warmUp();
