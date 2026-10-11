import { fileURLToPath } from 'node:url';
import { buildApp } from './app.js';
import { loadConfig } from './config.js';
import { createKeepAliveFetch } from './infra/http-agent.js';
import { loadEnv } from './infra/env.js';
import { OpenAiCompatClassifier } from './llm/openai-adapter.js';
import { providerName } from './llm/provider-name.js';

// Repo root is three levels up from both src/ and dist/ (apps/backend/{src,dist}/server.*).
loadEnv(fileURLToPath(new URL('../../../.env', import.meta.url)));

const config = loadConfig();
const hasPrimary = config.LLM_PRIMARY_API_KEY !== '';
// `app` is created below; the logger is only called after boot, so the late binding is safe.
const log = {
  warn: (o: object, m: string): void => app.log.warn(o, m),
  info: (o: object, m: string): void => app.log.info(o, m),
};
const primary = new OpenAiCompatClassifier({
  name: providerName(config.LLM_PRIMARY_BASE_URL),
  baseUrl: config.LLM_PRIMARY_BASE_URL,
  apiKey: config.LLM_PRIMARY_API_KEY,
  model: config.LLM_PRIMARY_MODEL,
  maxTokens: config.LLM_MAX_TOKENS,
  reasoningEffort: config.LLM_PRIMARY_REASONING_EFFORT,
  fetchFn: createKeepAliveFetch(),
  log,
});

const app = buildApp(config, {
  ...(hasPrimary ? { classifier: primary } : {}),
  mode: () => (hasPrimary ? `llm:${primary.name}` : 'heuristic'),
});
await app.listen({ port: config.PORT, host: '0.0.0.0' });
// Non-blocking: pays DNS/TLS before the first scored chunk. Result ignored.
if (hasPrimary) void primary.warmUp();
