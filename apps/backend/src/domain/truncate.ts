const TRAILING = /[\s_.,;:!?\-–—]+$/u;

export interface TruncateOptions {
  /** Also treat `_` as a word separator (hidden_intent snake_case). */
  underscore?: boolean;
}

/**
 * Word-boundary truncation (SPEC §2.2). Never appends "…".
 * Cuts at the last separator at index <= max if it lies in the last 40% of the window, else hard-cuts at max.
 * Returns "" when nothing is left (caller supplies a fallback).
 */
export function truncate(input: string, max: number, opts: TruncateOptions = {}): string {
  const s = input.trim();
  if (s.length <= max) return s;
  const isSep = (c: string | undefined): boolean =>
    c === ' ' || (opts.underscore === true && c === '_');
  let cut = max;
  for (let i = max; i >= 0; i--) {
    if (isSep(s[i])) {
      if (i >= max * 0.6) cut = i;
      break;
    }
  }
  return s.slice(0, cut).replace(TRAILING, '');
}
