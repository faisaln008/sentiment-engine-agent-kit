import {
  LIMITS,
  TelemetryResponseSchema,
  isBlankText,
  withAcousticDefaults,
  type TelemetryRequest,
  type TelemetryResponse,
} from '@app/contracts';
import { truncate } from '../domain/truncate.js';
import type { Classifier, ClassifyInput, LlmVerdict } from '../llm/classifier.js';
import { classifyRules } from '../heuristics/rule-classifier.js';

export interface AnalyzeDeps {
  /** Primary classifier (LLM chain or heuristic). */
  classifier: Classifier;
  deadlineMs: number;
  maxTextChars: number;
  /** Receives swallowed-exception reports (err.name/message only, never text). */
  onError?: (err: { name: string; message: string }) => void;
}

export interface AnalyzeOutcome {
  response: TelemetryResponse;
  provider: string;
  outcome: 'ok' | 'blank' | 'fallback';
  /** Why the primary did not answer (when outcome is `fallback`). */
  reason?: string;
  finish_reason?: string;
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

type Primary = Awaited<ReturnType<Classifier['classify']>>;

/** Runs the primary under a deadline counted from t0. Races the signal too, so a classifier that ignores it cannot overrun. */
async function runPrimary(
  c: Classifier,
  input: ClassifyInput,
  deadlineMs: number,
  t0: number,
): Promise<Primary> {
  const remaining = Math.max(1, Math.floor(deadlineMs - (performance.now() - t0)));
  const ac = new AbortController();
  let timer: NodeJS.Timeout | undefined;
  const expired = new Promise<Primary>((resolve) => {
    timer = setTimeout(() => {
      ac.abort();
      resolve({ ok: false, reason: 'timeout', provider: c.name, ms: remaining });
    }, remaining);
  });
  try {
    return await Promise.race([c.classify(input, ac.signal), expired]);
  } finally {
    clearTimeout(timer);
  }
}

/** Use-case: validated request -> schema-valid response. Never throws; any failure yields the heuristic verdict. */
export async function analyzeChunk(
  req: TelemetryRequest,
  deps: AnalyzeDeps,
  t0: number,
): Promise<AnalyzeOutcome> {
  const timestamp_ms = req.timestamp_ms ?? Date.now();
  if (isBlankText(req.text)) {
    return { response: build(req, NEUTRAL, t0), provider: 'none', outcome: 'blank', timestamp_ms };
  }
  const { values, imputed } = withAcousticDefaults(req.acoustic_metadata);
  const input: ClassifyInput = {
    text: req.text.trim().slice(0, deps.maxTextChars),
    speaker: req.speaker,
    acoustics: values,
    imputed,
  };
  let reason = 'exception';
  let finish: string | undefined;
  try {
    const r = await runPrimary(deps.classifier, input, deps.deadlineMs, t0);
    if (r.ok) {
      const fin = r.finishReason === undefined ? {} : { finish_reason: r.finishReason };
      return {
        response: build(req, r.verdict, t0),
        provider: r.provider,
        outcome: 'ok',
        timestamp_ms,
        ...fin,
      };
    }
    reason = r.reason;
    finish = r.finishReason;
  } catch (e) {
    const err = e instanceof Error ? e : new Error('non-error thrown');
    deps.onError?.({ name: err.name, message: err.message });
  }
  const h = heuristicVerdict(input);
  return {
    response: build(req, h, t0),
    provider: 'heuristic',
    outcome: 'fallback',
    reason,
    timestamp_ms,
    ...(finish === undefined ? {} : { finish_reason: finish }),
  };
}

/** Last resort when the primary fails, times out or throws. Pure and instant; guarded anyway so the endpoint can never 5xx. */
function heuristicVerdict(input: ClassifyInput): LlmVerdict {
  try {
    return classifyRules(input);
  } catch {
    return NEUTRAL;
  }
}
