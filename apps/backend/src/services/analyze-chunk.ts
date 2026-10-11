import {
  LIMITS,
  TelemetryResponseSchema,
  isBlankText,
  withAcousticDefaults,
  type TelemetryRequest,
  type TelemetryResponse,
} from '@app/contracts';
import { truncate } from '../domain/truncate.js';
import type { Classifier, LlmVerdict } from '../llm/classifier.js';

export interface AnalyzeDeps {
  classifier: Classifier;
  deadlineMs: number;
  maxTextChars: number;
}

export interface AnalyzeOutcome {
  response: TelemetryResponse;
  provider: string;
  outcome: 'ok' | 'blank' | 'error';
  timestamp_ms: number;
}

const NEUTRAL: LlmVerdict = {
  sentiment: 'neutral',
  confidence: 0.5,
  hidden_intent: 'none_detected',
  mitigation: 'Ask one clarifying question to surface their actual position',
  risk: 'low',
};

const round2 = (n: number): number => Math.round(Math.min(1, Math.max(0, n)) * 100) / 100;

function build(req: TelemetryRequest, v: LlmVerdict, t0: number): TelemetryResponse {
  const intent = truncate(v.hidden_intent, LIMITS.HIDDEN_INTENT_MAX, { underscore: true });
  const mitigation = truncate(v.mitigation, LIMITS.MITIGATION_MAX);
  return TelemetryResponseSchema.parse({
    chunk_id: req.chunk_id,
    processing_latency_ms: Math.max(0, Math.round(performance.now() - t0)),
    sentiment: v.sentiment,
    confidence: round2(v.confidence),
    volatility_flag: false, // S5: deterministic volatility
    hidden_intent: intent === '' ? NEUTRAL.hidden_intent : intent,
    mitigation_suggestion: mitigation === '' ? NEUTRAL.mitigation : mitigation,
    risk_level: v.risk,
  });
}

/** Use-case: validated request -> schema-valid response. Never throws; any failure yields a neutral result. */
export async function analyzeChunk(
  req: TelemetryRequest,
  deps: AnalyzeDeps,
  t0: number,
): Promise<AnalyzeOutcome> {
  const timestamp_ms = req.timestamp_ms ?? Date.now();
  if (isBlankText(req.text)) {
    return { response: build(req, NEUTRAL, t0), provider: 'none', outcome: 'blank', timestamp_ms };
  }
  try {
    const { values, imputed } = withAcousticDefaults(req.acoustic_metadata);
    const remaining = Math.max(1, Math.floor(deps.deadlineMs - (performance.now() - t0)));
    const r = await deps.classifier.classify(
      {
        text: req.text.trim().slice(0, deps.maxTextChars),
        speaker: req.speaker,
        acoustics: values,
        imputed,
      },
      AbortSignal.timeout(remaining),
    );
    if (r.ok)
      return {
        response: build(req, r.verdict, t0),
        provider: r.provider,
        outcome: 'ok',
        timestamp_ms,
      };
    return {
      response: build(req, NEUTRAL, t0),
      provider: r.provider,
      outcome: 'error',
      timestamp_ms,
    };
  } catch {
    return { response: build(req, NEUTRAL, t0), provider: 'none', outcome: 'error', timestamp_ms };
  }
}
