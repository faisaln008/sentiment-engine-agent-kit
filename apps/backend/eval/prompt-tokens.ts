/**
 * Measures provider-counted prompt tokens for the CURRENT prompt.ts (T10/T20).
 *   npx tsx apps/backend/eval/prompt-tokens.ts [--out reports/raw/prompt-tokens.jsonl]
 * Three calls, max_tokens 1, no JSON mode: system prompt + user "." (≈ system-only cost incl. chat template), and
 * two fixed, invented inputs (no context; 3 realistic context turns).
 * Env is loaded by the server's own loader (same file, same precedence); the key is sent, never printed or written.
 * Appends one JSON line per run: {time, prompt_version, model, system_chars, system_plus_dot, no_context, with_context}.
 */
import { appendFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { parseArgs } from 'node:util';
import { loadEnv } from '../src/infra/env.js';
import type { ClassifyInput, ContextTurn } from '../src/llm/classifier.js';
import { buildMessages, PROMPT_VERSION, SYSTEM_PROMPT } from '../src/llm/prompt.js';

const { values: a } = parseArgs({
  options: { out: { type: 'string', default: 'reports/raw/prompt-tokens.jsonl' } },
});
loadEnv(fileURLToPath(new URL('../../../.env', import.meta.url)));

const acoustics = {
  pitch_volatility: 0.4,
  speech_rate_wpm: 160,
  pause_duration_ms: 600,
  volume_intensity: 0.55,
};
const base: ClassifyInput = {
  text: 'We need the price to come down before procurement will even look at this again.',
  speaker: 'counterpart',
  acoustics,
  imputed: [],
  acousticNote: 'pace higher; pause long (0.6s)',
};
const turn = (
  speaker: ContextTurn['speaker'],
  sentiment: ContextTurn['sentiment'],
  text: string,
): ContextTurn => ({ speaker, sentiment, text });
const withContext: ClassifyInput = {
  ...base,
  context: [
    turn(
      'candidate',
      'neutral',
      'Thanks for joining. I sent the renewal quote on Monday with the three-year option and the usage tiers we discussed last quarter, including the onboarding credit.',
    ),
    turn(
      'counterpart',
      'negative',
      'We looked at it. Honestly the per-seat price went up again and our finance team flagged it as the largest increase across all our vendors this year.',
    ),
    turn(
      'candidate',
      'appeasement',
      'I completely understand, and I am sorry about that. We can probably do something on the price, whatever works best for you and your team really.',
    ),
  ],
};

async function promptTokens(input: ClassifyInput | null): Promise<number | string> {
  const baseUrl = (process.env['LLM_PRIMARY_BASE_URL'] ?? '').replace(/\/+$/, '');
  const effort = process.env['LLM_PRIMARY_REASONING_EFFORT'] ?? '';
  const res = await fetch(`${baseUrl}/chat/completions`, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      authorization: `Bearer ${process.env['LLM_PRIMARY_API_KEY'] ?? ''}`,
    },
    body: JSON.stringify({
      model: process.env['LLM_PRIMARY_MODEL'],
      temperature: 0,
      max_tokens: 1,
      ...(effort !== '' ? { reasoning_effort: effort } : {}),
      ...(effort !== '' && baseUrl.includes('groq') ? { include_reasoning: false } : {}),
      messages:
        input === null
          ? [
              { role: 'system', content: SYSTEM_PROMPT },
              { role: 'user', content: '.' },
            ]
          : buildMessages(input),
    }),
    signal: AbortSignal.timeout(10_000),
  });
  const body = (await res.json().catch(() => null)) as {
    usage?: { prompt_tokens?: unknown };
  } | null;
  const n = body?.usage?.prompt_tokens;
  return typeof n === 'number' ? n : `HTTP ${res.status}, no usage`;
}

const row = {
  time: new Date().toISOString(),
  prompt_version: PROMPT_VERSION,
  model: process.env['LLM_PRIMARY_MODEL'] ?? '(unset)',
  system_chars: SYSTEM_PROMPT.length,
  system_plus_dot: await promptTokens(null),
  no_context: await promptTokens(base),
  with_context: await promptTokens(withContext),
};
appendFileSync(a.out, `${JSON.stringify(row)}\n`);
console.log(JSON.stringify(row));
