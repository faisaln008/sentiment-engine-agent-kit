import type { RiskLevel, Sentiment } from '@app/contracts';
import { applyRiskRules } from './risk.js';
import { volatility } from './volatility.js';

export interface FusionInput {
  sentiment: Sentiment;
  /** Raw model/heuristic confidence. */
  confidence: number;
  /** Model/heuristic risk (already defaulted by the parser when missing). */
  risk: RiskLevel;
  arousalZ: number;
  pitchVolatility: number;
  prev?: { arousalZ: number; sentiment: Sentiment } | undefined;
  threshold: number;
  /** Heuristic answers are capped (skill: confidence <= 0.6). */
  confidenceCap?: number;
}

export interface FusionResult {
  confidence: number;
  volatility_flag: boolean;
  /** Per-chunk v (2dp), kept for eval/debug only. */
  v: number;
  risk: RiskLevel;
}

const clamp01 = (x: number): number => Math.min(1, Math.max(0, x));
const round2 = (x: number): number => Math.round(x * 100) / 100;

/** Order is part of the contract: volatility -> confidence calibration -> risk (risk sees calibrated c). */
export function fuse(i: FusionInput): FusionResult {
  const v = volatility({
    arousalZ: i.arousalZ,
    sentiment: i.sentiment,
    pitchVolatility: i.pitchVolatility,
    prev: i.prev,
  });
  const volatility_flag = v + 1e-9 >= i.threshold; // epsilon: 0.1 + 0.5 style float sums
  let c = clamp01(i.confidence);
  if (i.confidenceCap !== undefined) c = Math.min(c, i.confidenceCap);
  const contradicts =
    Math.abs(i.arousalZ) >= 1.5 && (i.sentiment === 'positive' || i.sentiment === 'neutral');
  if (contradicts) c *= 0.85;
  const confidence = round2(c);
  return {
    confidence,
    volatility_flag,
    v: round2(v),
    risk: applyRiskRules(i.risk, i.sentiment, volatility_flag, confidence),
  };
}
