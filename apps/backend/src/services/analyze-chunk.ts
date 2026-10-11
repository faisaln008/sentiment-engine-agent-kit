import {
  isBlankText,
  withAcousticDefaults,
  type TelemetryRequest,
  type TelemetryResponse,
} from '@app/contracts';
import { arousalZ, describeAcoustics, zScores } from '../domain/acoustic-baseline.js';
import { fuse } from '../domain/fusion.js';
import { classifyRules } from '../heuristics/rule-classifier.js';
import type { Classifier, ClassifyInput, LlmVerdict } from '../llm/classifier.js';
import type { CommitRecord, Snapshot } from '../session/session-store.js';
import { NEUTRAL, buildResponse } from './build-response.js';
import { runPrimary } from './run-primary.js';

const HEURISTIC_CONF_CAP = 0.6;

export interface AnalyzeDeps {
  /** Primary classifier (LLM chain or heuristic). */
  classifier: Classifier;
  deadlineMs: number;
  maxTextChars: number;
  volatilityThreshold: number;
  /** Receives swallowed-exception reports: err name/message and ids only, never text. */
  onError?: (
    err: { name: string; message: string },
    ctx: { chunk_id: string; session_id: string },
  ) => void;
}

export interface AnalyzeOutcome {
  response: TelemetryResponse;
  provider: string;
  outcome: 'ok' | 'blank' | 'fallback';
  /** Why the primary did not answer (when outcome is `fallback`). */
  reason?: string;
  finish_reason?: string;
  /** Chain skip kind when nothing was actually called. */
  skip?: string;
  /** Quota type of a 429 (TPM/TPD/RPM/RPD) when the provider said. */
  limit?: string;
  timestamp_ms: number;
  /** For SessionStore.commit(), called by the route right after the response is sent. */
  record: CommitRecord;
}

interface Why {
  reason: string;
  finish?: string | undefined;
  skip?: string | undefined;
  limit?: string | undefined;
}

/** Use-case: validated request + arrival snapshot -> schema-valid response. Never throws. */
export async function analyzeChunk(
  req: TelemetryRequest,
  deps: AnalyzeDeps,
  t0: number,
  snap: Snapshot,
): Promise<AnalyzeOutcome> {
  const timestamp_ms = req.timestamp_ms ?? Date.now();
  try {
    return await analyzeInner(req, deps, t0, snap, timestamp_ms);
  } catch (e) {
    report(deps, req, e);
    return emergency(req, t0, timestamp_ms);
  }
}

function report(deps: AnalyzeDeps, req: TelemetryRequest, e: unknown): void {
  const err = e instanceof Error ? e : new Error('non-error thrown');
  deps.onError?.(
    { name: err.name, message: err.message },
    { chunk_id: req.chunk_id, session_id: req.session_id },
  );
}

function neutralRecord(req: TelemetryRequest, ts: number, blank: boolean): CommitRecord {
  const { values, imputed } = withAcousticDefaults(req.acoustic_metadata);
  return {
    chunk_id: req.chunk_id,
    timestamp_ms: ts,
    speaker: req.speaker,
    text: req.text.trim(),
    sentiment: 'neutral',
    risk: 'low',
    flagged: false,
    acoustics: values,
    imputed,
    arousalZ: 0,
    blank,
  };
}

async function analyzeInner(
  req: TelemetryRequest,
  deps: AnalyzeDeps,
  t0: number,
  snap: Snapshot,
  ts: number,
): Promise<AnalyzeOutcome> {
  const noFuse = { confidence: NEUTRAL.confidence, volatility_flag: false, risk: NEUTRAL.risk };
  if (isBlankText(req.text)) {
    return {
      response: buildResponse(req, NEUTRAL, noFuse, t0),
      provider: 'none',
      outcome: 'blank',
      timestamp_ms: ts,
      record: neutralRecord(req, ts, true),
    };
  }
  const base = snap.baselines[req.speaker];
  const wpm = base.speech_rate_wpm.n > 0 ? base.speech_rate_wpm.mean : undefined;
  const { values, imputed } = withAcousticDefaults(req.acoustic_metadata, wpm);
  const arousal = arousalZ(zScores(base, values, imputed));
  const input: ClassifyInput = {
    text: req.text.trim().slice(0, deps.maxTextChars),
    speaker: req.speaker,
    acoustics: values,
    imputed,
    meta: { chunk_id: req.chunk_id, session_id: req.session_id },
    context: snap.turns,
    acousticNote: describeAcoustics(values, imputed, base),
    arousalZ: arousal,
  };
  const finish = (v: LlmVerdict, heuristic: boolean) => {
    const f = fuse({
      sentiment: v.sentiment,
      confidence: v.confidence,
      risk: v.risk,
      arousalZ: arousal,
      pitchVolatility: values.pitch_volatility,
      prev: snap.prev[req.speaker],
      threshold: deps.volatilityThreshold,
      ...(heuristic ? { confidenceCap: HEURISTIC_CONF_CAP } : {}),
    });
    const record: CommitRecord = {
      chunk_id: req.chunk_id,
      timestamp_ms: ts,
      speaker: req.speaker,
      text: input.text,
      sentiment: v.sentiment,
      risk: f.risk,
      flagged: f.volatility_flag,
      acoustics: values,
      imputed,
      arousalZ: arousal,
      blank: false,
    };
    return { response: buildResponse(req, v, f, t0), record };
  };
  let why: Why = { reason: 'exception' };
  try {
    const r = await runPrimary(deps.classifier, input, deps.deadlineMs, t0);
    if (r.ok) {
      const fin = r.finishReason === undefined ? {} : { finish_reason: r.finishReason };
      const heur = r.provider === 'heuristic';
      return {
        ...finish(r.verdict, heur),
        provider: r.provider,
        outcome: 'ok',
        timestamp_ms: ts,
        ...fin,
      };
    }
    why = { reason: r.reason, finish: r.finishReason, skip: r.skip, limit: r.limit };
  } catch (e) {
    report(deps, req, e);
  }
  return {
    ...finish(heuristicVerdict(input), true),
    provider: 'heuristic',
    outcome: 'fallback',
    reason: why.reason,
    timestamp_ms: ts,
    ...(why.finish === undefined ? {} : { finish_reason: why.finish }),
    ...(why.skip === undefined ? {} : { skip: why.skip }),
    ...(why.limit === undefined ? {} : { limit: why.limit }),
  };
}

/** Last line of defence (the service itself threw): neutral answer, still schema-valid, committed as neutral. */
function emergency(req: TelemetryRequest, t0: number, ts: number): AnalyzeOutcome {
  const noFuse = { confidence: NEUTRAL.confidence, volatility_flag: false, risk: NEUTRAL.risk };
  return {
    response: buildResponse(req, NEUTRAL, noFuse, t0),
    provider: 'none',
    outcome: 'fallback',
    reason: 'exception',
    timestamp_ms: ts,
    record: neutralRecord(req, ts, isBlankText(req.text)),
  };
}

/** Last resort when the primary fails, times out or throws. Pure and instant; guarded anyway. */
function heuristicVerdict(input: ClassifyInput): LlmVerdict {
  try {
    return classifyRules(input);
  } catch {
    return NEUTRAL;
  }
}
