/**
 * Eval-side defaults that mirror backend config (no import of backend src). Precedence: CLI flag > process env > fallback.
 * Each value carries its source so reports never present an assumed value as observed.
 * Note: eval scripts do not load `.env`; only variables exported in the shell are seen.
 */
export interface Sourced {
  value: number;
  source: string;
}

export function sourcedNumber(
  name: string,
  flag: string | undefined,
  flagName: string,
  fallback: number,
  range: [number, number],
): Sourced {
  const ok = (n: number): boolean => Number.isFinite(n) && n >= range[0] && n <= range[1];
  if (flag !== undefined) {
    const n = Number(flag);
    if (!ok(n)) throw new Error(`--${flagName} must be in [${range[0]}, ${range[1]}]`);
    return { value: n, source: `--${flagName}` };
  }
  const env = process.env[name];
  if (env !== undefined && env.trim() !== '') {
    const n = Number(env);
    if (ok(n)) return { value: n, source: `env ${name}` };
  }
  return { value: fallback, source: `fallback ${fallback} (${name} not set in env)` };
}

/** Same threshold the backend reads (SPEC §5.1, default 0.6). */
export const volatilityThreshold = (): Sourced =>
  sourcedNumber('VOLATILITY_THRESHOLD', undefined, 'volatility-threshold', 0.6, [0, 1]);
