import type { Config } from '../config.js';
import type { FetchFn } from '../infra/http-agent.js';
import { FallbackChain } from './fallback-chain.js';
import { OpenAiCompatClassifier, type AdapterLog } from './openai-adapter.js';
import { providerName } from './provider-name.js';

export interface BuiltChain {
  /** Null when no key is configured at all (heuristic-only mode). */
  chain: FallbackChain | null;
  providers: OpenAiCompatClassifier[];
}

/**
 * Providers with a key, primary first. One key of either kind is enough: it becomes the effective primary
 * and `/health.mode` names it (SPEC §9 "Only one key").
 */
export function buildChain(
  c: Config,
  fetchFn: FetchFn,
  log: AdapterLog,
  onDisabled: (provider: string, status: number) => void,
  onBreakerOpen?: (provider: string, info: { retryAfterMs: number; cooldownMs: number }) => void,
): BuiltChain {
  const make = (role: 'PRIMARY' | 'FALLBACK'): OpenAiCompatClassifier | null => {
    const apiKey = c[`LLM_${role}_API_KEY`];
    if (apiKey === '') return null;
    const baseUrl = c[`LLM_${role}_BASE_URL`];
    return new OpenAiCompatClassifier({
      name: providerName(baseUrl),
      baseUrl,
      apiKey,
      model: c[`LLM_${role}_MODEL`],
      maxTokens: c.LLM_MAX_TOKENS,
      reasoningEffort: c[`LLM_${role}_REASONING_EFFORT`],
      fetchFn,
      log,
    });
  };
  const providers = [make('PRIMARY'), make('FALLBACK')].filter(
    (p): p is OpenAiCompatClassifier => p !== null,
  );
  if (providers.length === 0) return { chain: null, providers };
  const chain = new FallbackChain({
    providers,
    circuitFailures: c.LLM_CIRCUIT_FAILURES,
    circuitCooldownMs: c.LLM_CIRCUIT_COOLDOWN_MS,
    maxInflight: c.LLM_MAX_INFLIGHT,
    onDisabled,
    ...(onBreakerOpen === undefined ? {} : { onBreakerOpen }),
  });
  return { chain, providers };
}
