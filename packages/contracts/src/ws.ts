/**
 * @app/contracts — ws.ts
 *
 * WS /ws/telemetry (optional per the brief; used by our dashboard). Server → client only.
 * Clients must validate every frame with ServerMessageSchema and drop invalid ones.
 * Status: FROZEN 2026-10-11. Changes require a new ADR plus explicit human approval.
 */
import { z } from 'zod';
import { LIMITS, SpeakerSchema, TelemetryResponseSchema } from './telemetry.js';

export const WS_PATH = '/ws/telemetry';

export const HelloMessageSchema = z.object({
  type: z.literal('hello'),
  /** Same value as GET /health `mode`. */
  mode: z.string().min(1),
});
export type HelloMessage = z.infer<typeof HelloMessageSchema>;

export const AnalysisMessageSchema = z.object({
  type: z.literal('analysis'),
  session_id: z.string(),
  speaker: SpeakerSchema,
  /** ≤ 80 chars, word-boundary truncated. Never the full text. */
  text_excerpt: z.string().max(LIMITS.TEXT_EXCERPT_MAX),
  /** Server-side timestamp_ms of the chunk (request value or server time). */
  timestamp_ms: z.number(),
  result: TelemetryResponseSchema,
});
export type AnalysisMessage = z.infer<typeof AnalysisMessageSchema>;

export const ServerMessageSchema = z.discriminatedUnion('type', [
  HelloMessageSchema,
  AnalysisMessageSchema,
]);
export type ServerMessage = z.infer<typeof ServerMessageSchema>;
