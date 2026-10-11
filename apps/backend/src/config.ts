import { z } from 'zod';

const LOG_LEVELS = ['fatal', 'error', 'warn', 'info', 'debug', 'trace', 'silent'] as const;

const posInt = (def: number) => z.coerce.number().int().positive().default(def);
const str = (def: string) => z.string().default(def);

const EFFORTS = ['none', 'minimal', 'low', 'medium', 'high'] as const;

const ConfigSchema = z.object({
  /** Listen address. Loopback by default: 0.0.0.0 is an explicit opt-in (exposes every session to the LAN). */
  HOST: str('127.0.0.1'),
  PORT: z.coerce.number().int().min(1).max(65535).default(3000),
  LOG_LEVEL: z
    .enum(LOG_LEVELS, { error: `must be one of ${LOG_LEVELS.join('|')}` })
    .default('info'),
  CORS_ORIGIN: str('http://localhost:5173'),
  LLM_PRIMARY_BASE_URL: str('https://api.groq.com/openai/v1'),
  LLM_PRIMARY_API_KEY: str(''),
  LLM_PRIMARY_MODEL: str('qwen/qwen3.8-27b'),
  LLM_PRIMARY_REASONING_EFFORT: z.enum(EFFORTS).optional(),
  LLM_FALLBACK_BASE_URL: str('https://generativelanguage.googleapis.com/v1beta/openai'),
  LLM_FALLBACK_API_KEY: str(''),
  LLM_FALLBACK_MODEL: str('gemini-3.5-flash-lite'),
  LLM_FALLBACK_REASONING_EFFORT: z.enum(EFFORTS).optional(),
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
  WS_MAX_CLIENTS: posInt(50),
  WS_PING_INTERVAL_MS: posInt(30_000),
});

export type Config = z.infer<typeof ConfigSchema>;

/** Empty-string values (e.g. `LLM_PRIMARY_API_KEY=`) count as unset so defaults apply. */
function dropEmpty(env: NodeJS.ProcessEnv): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [k, v] of Object.entries(env)) if (v !== undefined && v.trim() !== '') out[k] = v;
  return out;
}

/**
 * Single import point for configuration. Missing keys never throw; out-of-range values throw a readable error.
 * `LLM_PRIMARY_REASONING_EFFORT`: absent => `none` (the CP1 default for qwen/qwen3.8-27b, ADR-005);
 * present but empty => the field is omitted from requests (for models that reject it).
 */
export function loadConfig(env: NodeJS.ProcessEnv = process.env): Config {
  const r = ConfigSchema.safeParse(dropEmpty(env));
  if (!r.success) {
    const lines = r.error.issues.map((i) => `  ${i.path.join('.')}: ${i.message}`);
    throw new Error(`Invalid configuration:\n${lines.join('\n')}`);
  }
  const cfg: Config = { ...r.data };
  const raw = env['LLM_PRIMARY_REASONING_EFFORT'];
  if (raw === undefined) cfg.LLM_PRIMARY_REASONING_EFFORT = 'none';
  else if (raw.trim() === '') delete cfg.LLM_PRIMARY_REASONING_EFFORT;
  return cfg;
}
