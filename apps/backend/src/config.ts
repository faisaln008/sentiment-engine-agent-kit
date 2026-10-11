import { z } from 'zod';

const LOG_LEVELS = ['fatal', 'error', 'warn', 'info', 'debug', 'trace', 'silent'] as const;

const posInt = (def: number) => z.coerce.number().int().positive().default(def);
const str = (def: string) => z.string().default(def);

const ConfigSchema = z.object({
  PORT: z.coerce.number().int().min(1).max(65535).default(3000),
  LOG_LEVEL: z
    .enum(LOG_LEVELS, { error: `must be one of ${LOG_LEVELS.join('|')}` })
    .default('info'),
  CORS_ORIGIN: str('http://localhost:5173'),
  LLM_PRIMARY_BASE_URL: str('https://api.groq.com/openai/v1'),
  LLM_PRIMARY_API_KEY: str(''),
  LLM_PRIMARY_MODEL: str('llama-3.1-8b-instant'),
  LLM_FALLBACK_BASE_URL: str('https://generativelanguage.googleapis.com/v1beta/openai'),
  LLM_FALLBACK_API_KEY: str(''),
  LLM_FALLBACK_MODEL: str('gemini-3.5-flash-lite'),
  LLM_DEADLINE_MS: posInt(450),
  LLM_MAX_TOKENS: posInt(90),
  LLM_CIRCUIT_FAILURES: posInt(3),
  LLM_CIRCUIT_COOLDOWN_MS: posInt(15000),
  LLM_MAX_INFLIGHT: posInt(16),
  CONTEXT_TURNS: posInt(3),
  VOLATILITY_THRESHOLD: z.coerce.number().min(0).max(1).default(0.6),
  SESSION_TTL_MS: posInt(1_800_000),
  MAX_SESSIONS: posInt(1000),
  MAX_TEXT_CHARS: posInt(2000),
});

export type Config = z.infer<typeof ConfigSchema>;

/** Empty-string values (e.g. `LLM_PRIMARY_API_KEY=`) count as unset so defaults apply. */
function dropEmpty(env: NodeJS.ProcessEnv): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [k, v] of Object.entries(env)) if (v !== undefined && v.trim() !== '') out[k] = v;
  return out;
}

/** Single import point for configuration. Missing keys never throw; out-of-range values throw a readable error. */
export function loadConfig(env: NodeJS.ProcessEnv = process.env): Config {
  const r = ConfigSchema.safeParse(dropEmpty(env));
  if (r.success) return r.data;
  const lines = r.error.issues.map((i) => `  ${i.path.join('.')}: ${i.message}`);
  throw new Error(`Invalid configuration:\n${lines.join('\n')}`);
}
