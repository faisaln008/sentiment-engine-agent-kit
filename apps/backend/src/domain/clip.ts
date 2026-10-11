export const TURN_MAX_WORDS = 40;
export const TURN_MAX_CHARS = 240;

/** Context-turn bound: at most 40 words AND 240 chars (one giant "word" cannot inflate the prompt). */
export function clipTurn(text: string): string {
  const words = text.trim().split(/\s+/);
  const joined = (words.length <= TURN_MAX_WORDS ? words : words.slice(0, TURN_MAX_WORDS)).join(
    ' ',
  );
  return joined.length <= TURN_MAX_CHARS ? joined : joined.slice(0, TURN_MAX_CHARS).trimEnd();
}
