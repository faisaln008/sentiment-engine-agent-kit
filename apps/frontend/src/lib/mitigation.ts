import type { StreamItem } from './store';

/** Current + up to 2 previous *distinct* suggestions, newest first. */
export function mitigationHistory(items: readonly StreamItem[]): {
  current: string | null;
  previous: string[];
} {
  const seen: string[] = [];
  for (const i of items) {
    const m = i.result.mitigation_suggestion;
    if (!seen.includes(m)) seen.push(m);
    if (seen.length === 3) break;
  }
  return { current: seen[0] ?? null, previous: seen.slice(1) };
}
