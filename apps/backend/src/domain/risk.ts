import { RISK_ORDER, type RiskLevel, type Sentiment } from '@app/contracts';

const atLeast = (r: RiskLevel, floor: RiskLevel): RiskLevel =>
  RISK_ORDER[r] >= RISK_ORDER[floor] ? r : floor;
const atMost = (r: RiskLevel, cap: RiskLevel): RiskLevel =>
  RISK_ORDER[r] <= RISK_ORDER[cap] ? r : cap;

/**
 * ADR-003 §5, applied in order: (1) aggressive >= high; (2) aggressive and volatility => critical;
 * (3) positive with CALIBRATED confidence >= 0.8 => <= medium.
 */
export function applyRiskRules(
  risk: RiskLevel,
  sentiment: Sentiment,
  volatilityFlag: boolean,
  calibratedConfidence: number,
): RiskLevel {
  let r = risk;
  if (sentiment === 'aggressive') r = atLeast(r, 'high');
  if (sentiment === 'aggressive' && volatilityFlag) r = 'critical';
  if (sentiment === 'positive' && calibratedConfidence >= 0.8) r = atMost(r, 'medium');
  return r;
}
