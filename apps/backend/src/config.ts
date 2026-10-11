import { z } from 'zod';

const int = (def: number) => z.coerce.number().int().default(def);
const str = (def: string) => z.string().default(def);

const ConfigSchema = z.object({
  PORT: int(3000),
  LOG_LEVEL: str('info'),
  CORS_ORIGIN: str('http://localhost:5173'),
  LLM_PRIMARY_BASE_URL: str('https://api.groq.com/openai/v1'),
  LLM_PRIMARY_API_KEY: str(''),
  LLM_PRIMARY_MODEL: str('llama-3.1-8b-instant'),
  LLM_FALLBACK_BASE_URL: str('https://generativelanguage.googleapis.com/v1beta/openai'),
  LLM_FALLBACK_API_KEY: str(''),
  LLM_FALLBACK_MODEL: str('gemini-3.5-flash-lite'),
  LLM_DEADLINE_MS: int(450),
  LLM_MAX_TOKENS: int(90),
  LLM_CIRCUIT_FAILURES: int(3),
  LLM_CIRCUIT_COOLDOWN_MS: int(15000),
  LLM_MAX_INFLIGHT: int(16),
  CONTEXT_TURNS: int(3),
  VOLATILITY_THRESHOLD: z.coerce.number().default(0.6),
  SESSION_TTL_MS: int(1_800_000),
  MAX_SESSIONS: int(1000),
  MAX_TEXT_CHARS: int(2000),
});

export type Config = z.infer<typeof ConfigSchema>;

/** Single import point for configuration. Never throws on missing keys. */
export function loadConfig(env: NodeJS.ProcessEnv = process.env): Config {
  return ConfigSchema.parse(env);
}
