import type { RiskLevel } from '@app/contracts';

export interface RiskMeta {
  icon: string;
  label: string;
  /** Critical is announced assertively (role=alert); others politely (role=status). */
  role: 'alert' | 'status';
}

export const RISK_META: Readonly<Record<RiskLevel, RiskMeta>> = {
  low: { icon: '✓', label: 'LOW', role: 'status' },
  medium: { icon: '!', label: 'MEDIUM', role: 'status' },
  high: { icon: '▲', label: 'HIGH', role: 'status' },
  critical: { icon: '⛔', label: 'CRITICAL', role: 'alert' },
};
