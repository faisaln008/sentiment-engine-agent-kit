/**
 * Free-tier rate safety for eval/bench. LLM mode (or an explicit --tpm) derives the request rate from a token budget:
 * RPM = floor(tpm / tokens-per-req), capped by --rpm when given. Heuristic mode is unthrottled unless --rpm is given.
 * The defaults are assumptions, NOT verified against provider docs: every report prints them as UNVERIFIED.
 */
export const DEFAULT_TPM = 6000;
export const DEFAULT_TOKENS_PER_REQ = 800;

export const RATE_OPTIONS = {
  rpm: { type: 'string' },
  tpm: { type: 'string' },
  'tokens-per-req': { type: 'string' },
} as const;

export interface RateArgs {
  rpm?: string | undefined;
  tpm?: string | undefined;
  'tokens-per-req'?: string | undefined;
}

export interface RatePlan {
  /** Request starts per minute; 0 = unthrottled. */
  rpm: number;
  /** Human-readable assumption line for the report (filled from the inputs). */
  assumption: string;
}

function positive(name: string, v: string | undefined, def: number): [number, string] {
  if (v === undefined) return [def, `${def} (default, UNVERIFIED)`];
  const n = Number(v);
  if (!Number.isFinite(n) || n <= 0) throw new Error(`--${name} must be a positive number`);
  return [n, `${n} (--${name})`];
}

/** Resolves the throttle from flags and the /health mode. Throws on invalid numbers. */
export function ratePlan(args: RateArgs, healthMode: string): RatePlan {
  const capArg = args.rpm === undefined ? undefined : Number(args.rpm);
  if (capArg !== undefined && (!Number.isFinite(capArg) || capArg < 0))
    throw new Error('--rpm must be a number >= 0');
  const llm = healthMode.startsWith('llm:');
  if (!llm && args.tpm === undefined) {
    const rpm = capArg ?? 0;
    return {
      rpm,
      assumption: `mode \`${healthMode}\` (no LLM): ${rpm > 0 ? `${rpm} RPM (--rpm)` : 'unthrottled'}; no token budget applied`,
    };
  }
  const [tpm, tpmSrc] = positive('tpm', args.tpm, DEFAULT_TPM);
  const [tpr, tprSrc] = positive('tokens-per-req', args['tokens-per-req'], DEFAULT_TOKENS_PER_REQ);
  const derived = Math.max(1, Math.floor(tpm / tpr));
  const rpm = capArg !== undefined && capArg > 0 ? Math.min(capArg, derived) : derived;
  return {
    rpm,
    assumption:
      `TPM ${tpmSrc} / tokens per request ${tprSrc} → ${derived} RPM` +
      `${capArg !== undefined && capArg > 0 ? `, capped by --rpm ${capArg}` : ''} → **${rpm} RPM used as limit**. ` +
      `Provider free-tier limits are UNVERIFIED (not checked against provider docs in this run).`,
  };
}

/** "n/a (unthrottled)" instead of a meaningless huge number when no limit was set. */
export const achievedText = (limit: number, achieved: number): string =>
  limit > 0 && Number.isFinite(achieved) ? achieved.toFixed(1) : 'n/a (unthrottled)';
