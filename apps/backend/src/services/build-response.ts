import {
  LIMITS,
  TelemetryResponseSchema,
  type RiskLevel,
  type TelemetryRequest,
  type TelemetryResponse,
} from '@app/contracts';
import { truncate } from '../domain/truncate.js';
import type { LlmVerdict } from '../llm/classifier.js';

export const NEUTRAL: LlmVerdict = {
  sentiment: 'neutral',
  confidence: 0.5,
  hidden_intent: 'none_detected',
  mitigation: 'Ask one clarifying question to surface their actual position',
  risk: 'low',
};

export interface Fused {
  confidence: number;
  volatility_flag: boolean;
  risk: RiskLevel;
}

/** Truncates free text on word boundaries and validates with the response schema before anything is sent. */
export function buildResponse(
  req: TelemetryRequest,
  v: LlmVerdict,
  f: Fused,
  t0: number,
): TelemetryResponse {
  const intent = truncate(v.hidden_intent, LIMITS.HIDDEN_INTENT_MAX, { underscore: true });
  const mitigation = truncate(v.mitigation, LIMITS.MITIGATION_MAX);
  return TelemetryResponseSchema.parse({
    chunk_id: req.chunk_id,
    processing_latency_ms: Math.max(0, Math.round(performance.now() - t0)),
    sentiment: v.sentiment,
    confidence: f.confidence,
    volatility_flag: f.volatility_flag,
    hidden_intent: intent === '' ? NEUTRAL.hidden_intent : intent,
    mitigation_suggestion: mitigation === '' ? NEUTRAL.mitigation : mitigation,
    risk_level: f.risk,
  });
}
