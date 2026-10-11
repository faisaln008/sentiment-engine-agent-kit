/**
 * @app/contracts — telemetry.ts
 *
 * Public HTTP contract of the Sentiment Intelligence Engine (see specs/SPEC.md §2).
 * Field names, enums and the 60/120 char limits are taken verbatim from the assignment brief.
 * Everything else here (lenient defaults, id limits, summary/health shapes) is our decision,
 * documented in SPEC.md and compatible with the reference backend's response shapes.
 *
 * Status: FROZEN 2026-10-11 (human-approved with specs/SPEC.md). Any change to this file requires
 * a new ADR in specs/adr/ plus explicit human approval. Request via .agent-work/requests/contract-change-<n>.md.
 *
 * Targets zod 4 (z.strictObject, z.preprocess). zod 4 issue `path` is PropertyKey[]:
 * the backend joins it to a string (e.g. "acoustic_metadata.pitch_volatility") for 400 bodies.
 */
import { z } from 'zod';

// ─── Enums (verbatim from the brief) ──────────────────────────────────────────

export const SENTIMENTS = [
  'positive',
  'negative',
  'neutral',
  'sarcastic',
  'aggressive',
  'deflecting',
  'appeasement',
] as const;
export const SentimentSchema = z.enum(SENTIMENTS);
export type Sentiment = z.infer<typeof SentimentSchema>;

export const RISK_LEVELS = ['low', 'medium', 'high', 'critical'] as const;
export const RiskLevelSchema = z.enum(RISK_LEVELS);
export type RiskLevel = z.infer<typeof RiskLevelSchema>;

export const SPEAKERS = ['candidate', 'counterpart'] as const;
export const SpeakerSchema = z.enum(SPEAKERS);
export type Speaker = z.infer<typeof SpeakerSchema>;

/** Ordinal for sorting / comparisons (critical highest). */
export const RISK_ORDER: Readonly<Record<RiskLevel, number>> = {
  low: 1,
  medium: 2,
  high: 3,
  critical: 4,
};

// ─── Limits ───────────────────────────────────────────────────────────────────

export const LIMITS = {
  /** Brief: hidden_intent max 60 chars. Truncate on word boundary, never fail. */
  HIDDEN_INTENT_MAX: 60,
  /** Brief: mitigation_suggestion max 120 chars. Truncate on word boundary, never fail. */
  MITIGATION_MAX: 120,
  /** Ours (human decision 2026-10-11): chunk_id / session_id max length. */
  ID_MAX: 512,
  /** Ours: summary + WS excerpt length. */
  TEXT_EXCERPT_MAX: 80,
  TOP_RISK_MOMENTS_MAX: 3,
  /** Ours: HTTP body limit (Fastify bodyLimit). Larger bodies → 413. */
  BODY_LIMIT_BYTES: 32 * 1024,
  /** Ours: max WS frame the client will accept/parse. */
  WS_MAX_MESSAGE_BYTES: 16 * 1024,
  /** Ours: sanity clamps for acoustic numbers (values outside are clamped, not rejected). */
  WPM_MAX: 1000,
  PAUSE_MS_MAX: 60_000,
} as const;

// ─── Acoustic metadata (lenient) ──────────────────────────────────────────────

/**
 * Neutral defaults applied by the backend when a field is missing or invalid.
 * speech_rate_wpm default is "this speaker's running baseline if known, else 150" —
 * the baseline lives in the backend SessionStore, so the contract only exports the prior.
 */
export const ACOUSTIC_DEFAULTS = {
  pitch_volatility: 0.3,
  speech_rate_wpm: 150,
  pause_duration_ms: 300,
  volume_intensity: 0.5,
} as const;

export const ACOUSTIC_FIELDS = [
  'pitch_volatility',
  'speech_rate_wpm',
  'pause_duration_ms',
  'volume_intensity',
] as const;
export type AcousticField = (typeof ACOUSTIC_FIELDS)[number];

function toFiniteNumber(v: unknown): number | undefined {
  const n = typeof v === 'string' && v.trim() !== '' ? Number(v) : v;
  return typeof n === 'number' && Number.isFinite(n) ? n : undefined;
}

/** Finite number (or numeric string) clamped into [min,max]; anything else → undefined (= missing). */
const lenientNumber = (min: number, max: number) =>
  z.preprocess((v) => {
    const n = toFiniteNumber(v);
    return n === undefined ? undefined : Math.min(max, Math.max(min, n));
  }, z.number().optional());

const AcousticObjectSchema = z.object({
  pitch_volatility: lenientNumber(0, 1),
  speech_rate_wpm: lenientNumber(0, LIMITS.WPM_MAX),
  pause_duration_ms: lenientNumber(0, LIMITS.PAUSE_MS_MAX),
  volume_intensity: lenientNumber(0, 1),
});

/**
 * Missing / null / non-object acoustic_metadata → {} (all fields missing). Never a 400.
 * Output keeps "missing" as undefined so the backend knows which fields were imputed
 * (imputed fields must NOT update the speaker baseline and contribute z = 0).
 */
export const AcousticMetadataSchema = z.preprocess(
  (v) => (v !== null && typeof v === 'object' && !Array.isArray(v) ? v : {}),
  AcousticObjectSchema,
);
export type AcousticMetadataPartial = z.infer<typeof AcousticMetadataSchema>;
export type AcousticMetadata = { [K in AcousticField]: number };

/** Fill missing fields with defaults; report which ones were imputed. Pure. */
export function withAcousticDefaults(
  partial: AcousticMetadataPartial,
  speakerWpmBaseline?: number,
): { values: AcousticMetadata; imputed: AcousticField[] } {
  const imputed: AcousticField[] = [];
  const pick = (k: AcousticField, fallback: number): number => {
    const v = partial[k];
    if (v === undefined) {
      imputed.push(k);
      return fallback;
    }
    return v;
  };
  return {
    values: {
      pitch_volatility: pick('pitch_volatility', ACOUSTIC_DEFAULTS.pitch_volatility),
      speech_rate_wpm: pick('speech_rate_wpm', speakerWpmBaseline ?? ACOUSTIC_DEFAULTS.speech_rate_wpm),
      pause_duration_ms: pick('pause_duration_ms', ACOUSTIC_DEFAULTS.pause_duration_ms),
      volume_intensity: pick('volume_intensity', ACOUSTIC_DEFAULTS.volume_intensity),
    },
    imputed,
  };
}

// ─── POST /api/telemetry/stream — request ─────────────────────────────────────

/** chunk_id is echoed byte-for-byte, so it is NOT trimmed; it must contain a non-space char. */
const IdSchema = z
  .string()
  .min(1)
  .max(LIMITS.ID_MAX)
  .refine((s) => s.trim().length > 0, { message: 'must not be blank' });

/**
 * Integer ms; numeric strings accepted. Anything that does not round to a safe integer ≥ 0
 * (e.g. 1e20, -5, "abc", NaN) → undefined (backend uses server time). Must never cause a 400:
 * zod 4 `.int()` rejects non-safe integers, so we filter before it.
 */
const TimestampSchema = z.preprocess((v) => {
  const n = toFiniteNumber(v);
  if (n === undefined) return undefined;
  const r = Math.round(n);
  return Number.isSafeInteger(r) && r >= 0 ? r : undefined;
}, z.number().int().nonnegative().optional());

/**
 * Case-insensitive; anything other than "candidate" → "counterpart".
 * The parsed value cannot tell "missing/unknown" apart from a real "counterpart": the backend reads
 * the RAW body's `speaker` to emit the unknown-speaker warn log (SPEC §2.1).
 */
const LenientSpeakerSchema = z.preprocess(
  (v) => (typeof v === 'string' && v.trim().toLowerCase() === 'candidate' ? 'candidate' : 'counterpart'),
  SpeakerSchema,
);

export const TelemetryRequestSchema = z.object({
  chunk_id: IdSchema,
  session_id: IdSchema,
  timestamp_ms: TimestampSchema,
  speaker: LenientSpeakerSchema,
  /**
   * Must be a string (else 400). Empty AND whitespace-only strings are accepted → 200 neutral
   * short-circuit, no LLM call (use `isBlankText`). No max here: bodies are capped at 32 KB;
   * the backend truncates to MAX_TEXT_CHARS before the prompt.
   */
  text: z.string(),
  acoustic_metadata: AcousticMetadataSchema,
});

/** True for "" and whitespace-only text (incl. \t \n and Unicode spaces removed by String#trim). */
export function isBlankText(text: string): boolean {
  return text.trim().length === 0;
}
/** SERVER-side lenient parse result (what the backend works with). */
export type TelemetryRequest = z.infer<typeof TelemetryRequestSchema>;

/**
 * CLIENT-side wire schema (demo player, simulate, eval, bench): the well-formed payload as the brief
 * describes it. Use this to BUILD requests with precise types; the server never rejects on it.
 */
export const AcousticMetadataWireSchema = z.object({
  pitch_volatility: z.number().min(0).max(1),
  speech_rate_wpm: z.number().nonnegative(),
  pause_duration_ms: z.number().nonnegative(),
  volume_intensity: z.number().min(0).max(1),
});
export const TelemetryRequestWireSchema = z.object({
  chunk_id: z.string().min(1).max(LIMITS.ID_MAX),
  session_id: z.string().min(1).max(LIMITS.ID_MAX),
  timestamp_ms: z.number().int().nonnegative(),
  speaker: SpeakerSchema,
  text: z.string(),
  acoustic_metadata: AcousticMetadataWireSchema.partial().optional(),
});
export type TelemetryRequestWire = z.infer<typeof TelemetryRequestWireSchema>;

// ─── POST /api/telemetry/stream — response (strict: exactly these 8 keys) ─────

export const TelemetryResponseSchema = z.strictObject({
  chunk_id: z.string(),
  processing_latency_ms: z.number().int().nonnegative(),
  sentiment: SentimentSchema,
  confidence: z.number().min(0).max(1),
  volatility_flag: z.boolean(),
  hidden_intent: z.string().min(1).max(LIMITS.HIDDEN_INTENT_MAX),
  mitigation_suggestion: z.string().min(1).max(LIMITS.MITIGATION_MAX),
  risk_level: RiskLevelSchema,
});
export type TelemetryResponse = z.infer<typeof TelemetryResponseSchema>;

// ─── Errors ───────────────────────────────────────────────────────────────────

/** 400 body. Never contains request `text`. */
export const ValidationErrorSchema = z.object({
  error: z.literal('invalid_request'),
  issues: z.array(z.object({ path: z.string(), message: z.string() })),
});
export type ValidationError = z.infer<typeof ValidationErrorSchema>;

export const SessionNotFoundSchema = z.object({ error: z.literal('session_not_found') });
export type SessionNotFound = z.infer<typeof SessionNotFoundSchema>;

// ─── GET /health (shape-compatible with the reference backend) ────────────────

/** Our backend's mode values: "llm:<provider>" | "heuristic". */
export const OUR_HEALTH_MODE_RE = /^(llm:[a-z0-9._-]+|heuristic)$/;

/**
 * Shape check only: `mode` is a free string so the frontend can also read the reference
 * backend (which reports "placeholder"). Backend tests additionally assert OUR_HEALTH_MODE_RE.
 */
export const HealthSchema = z.object({
  status: z.literal('ok'),
  mode: z.string().min(1),
  version: z.string(),
  /** Unix epoch ms, like the reference backend. */
  timestamp: z.number(),
});
export type Health = z.infer<typeof HealthSchema>;

// ─── GET /api/telemetry/session/:sessionId/summary ────────────────────────────

export const RiskMomentSchema = z.object({
  chunk_id: z.string(),
  timestamp_ms: z.number(),
  sentiment: SentimentSchema,
  risk_level: RiskLevelSchema,
  /** Real transcript excerpt (≤ 80 chars, word-boundary truncated). Reference puts hidden_intent here. */
  text_excerpt: z.string().max(LIMITS.TEXT_EXCERPT_MAX),
});
export type RiskMoment = z.infer<typeof RiskMomentSchema>;

export const SessionSummarySchema = z.object({
  session_id: z.string(),
  chunk_count: z.number().int().positive(),
  /** Fraction of chunks with volatility_flag=true, 0–1, 2 decimals (same as reference). SPEC.md §5.4. */
  aggregated_volatility_score: z.number().min(0).max(1),
  dominant_sentiment: SentimentSchema,
  /** Only high/critical chunks, risk desc then most recent first, ≤ 3 (may be empty). */
  top_risk_moments: z.array(RiskMomentSchema).max(LIMITS.TOP_RISK_MOMENTS_MAX),
});
export type SessionSummary = z.infer<typeof SessionSummarySchema>;
