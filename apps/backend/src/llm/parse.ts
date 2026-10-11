import {
  RiskLevelSchema,
  SentimentSchema,
  type RiskLevel,
  type Sentiment,
  type Speaker,
} from '@app/contracts';
import type { LlmVerdict } from './classifier.js';

/** Synonyms small models emit instead of the exact enum (lowercased before lookup). */
const SENTIMENT_SYNONYMS: Readonly<Record<string, Sentiment>> = {
  sarcasm: 'sarcastic',
  ironic: 'sarcastic',
  aggression: 'aggressive',
  hostile: 'aggressive',
  deflection: 'deflecting',
  evasive: 'deflecting',
  appeasing: 'appeasement',
  appease: 'appeasement',
  placating: 'appeasement',
  pos: 'positive',
  neg: 'negative',
  neu: 'neutral',
};

const RISK_SYNONYMS: Readonly<Record<string, RiskLevel>> = {
  med: 'medium',
  moderate: 'medium',
  crit: 'critical',
  severe: 'critical',
};

/** ADR-003 §4: risk when the model omits or garbles `r`. */
export function defaultRisk(s: Sentiment, speaker: Speaker): RiskLevel {
  switch (s) {
    case 'aggressive':
      return 'high';
    case 'sarcastic':
    case 'deflecting':
    case 'negative':
      return 'medium';
    case 'appeasement':
      return speaker === 'candidate' ? 'medium' : 'low';
    default:
      return 'low';
  }
}

/** Provider response body -> assistant text + finish_reason. Never throws. */
export function extractContent(body: unknown): {
  content: string | null;
  finishReason: string | null;
} {
  const choices = (body as { choices?: unknown } | null)?.choices;
  const first: unknown = Array.isArray(choices) ? choices[0] : undefined;
  if (first === null || typeof first !== 'object') return { content: null, finishReason: null };
  const c = first as { message?: { content?: unknown }; finish_reason?: unknown };
  const content = typeof c.message?.content === 'string' ? c.message.content : null;
  return { content, finishReason: typeof c.finish_reason === 'string' ? c.finish_reason : null };
}

/** Strips ``` fences and returns the first balanced `{…}` object (string-aware), or null. */
function jsonSlice(text: string): string | null {
  const t = text.replace(/```(?:json)?/gi, '');
  const start = t.indexOf('{');
  if (start < 0) return null;
  let depth = 0;
  let inStr = false;
  for (let i = start; i < t.length; i++) {
    const ch = t[i];
    if (inStr) {
      if (ch === '\\') i++;
      else if (ch === '"') inStr = false;
    } else if (ch === '"') inStr = true;
    else if (ch === '{') depth++;
    else if (ch === '}' && --depth === 0) return t.slice(start, i + 1);
  }
  return null;
}

const pickKey = (o: Record<string, unknown>, ...keys: string[]): unknown => {
  for (const k of keys) if (o[k] !== undefined && o[k] !== null) return o[k];
  return undefined;
};

function lowerEnum<T extends string>(
  raw: unknown,
  schema: { safeParse(v: unknown): { success: boolean; data?: T } },
  syn: Readonly<Record<string, T>>,
): T | null {
  if (typeof raw !== 'string') return null;
  const k = raw.trim().toLowerCase();
  const direct = schema.safeParse(k);
  if (direct.success && direct.data !== undefined) return direct.data;
  return syn[k] ?? null;
}

const text = (v: unknown): string => (typeof v === 'string' ? v.replace(/\s+/g, ' ').trim() : '');

/**
 * Model text -> verdict, or null (= bad_json). Tolerates fences, prose around the object, extra keys,
 * enum casing/synonyms, long key names, string/out-of-range confidence. Unknown sentiment => null.
 */
export function parseVerdict(content: string, speaker: Speaker): LlmVerdict | null {
  const slice = jsonSlice(content);
  if (slice === null) return null;
  let obj: unknown;
  try {
    obj = JSON.parse(slice);
  } catch {
    return null;
  }
  if (obj === null || typeof obj !== 'object' || Array.isArray(obj)) return null;
  const o = obj as Record<string, unknown>;
  const sentiment = lowerEnum(pickKey(o, 's', 'sentiment'), SentimentSchema, SENTIMENT_SYNONYMS);
  if (sentiment === null) return null;
  const rc = pickKey(o, 'c', 'confidence');
  const rawC = typeof rc === 'string' && rc.trim() === '' ? NaN : Number(rc);
  const confidence = Number.isFinite(rawC) ? Math.min(1, Math.max(0, rawC)) : 0.5;
  const risk =
    lowerEnum(pickKey(o, 'r', 'risk', 'risk_level'), RiskLevelSchema, RISK_SYNONYMS) ??
    defaultRisk(sentiment, speaker);
  return {
    sentiment,
    confidence,
    hidden_intent: text(pickKey(o, 'i', 'hidden_intent')),
    mitigation: text(pickKey(o, 'm', 'mitigation', 'mitigation_suggestion')),
    risk,
  };
}
