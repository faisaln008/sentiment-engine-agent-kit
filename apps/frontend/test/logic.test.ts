import { describe, expect, it } from 'vitest';
import { mitigationHistory } from '../src/lib/mitigation';
import { RISK_META } from '../src/lib/risk';
import { serverP50 } from '../src/lib/stats';
import { VOLATILITY_DECAY_MS, volatilityView } from '../src/lib/volatility';
import { item } from './helpers';

const vol = (id: string, at: number, text = 'boom') =>
  item(id, 's', { received_at: at, text_excerpt: text }, { volatility_flag: true });
const calm = (id: string, at: number) => item(id, 's', { received_at: at });

describe('volatilityView (items newest first)', () => {
  it('null with no volatile chunk', () => {
    expect(volatilityView([calm('a', 0)], 1000)).toBeNull();
  });
  it('active when the newest chunk is volatile; shows trigger and age', () => {
    expect(volatilityView([vol('a', 1000)], 3500)).toEqual({
      tone: 'active',
      trigger: 'boom',
      ageS: 2,
    });
  });
  it('decays exactly at the window', () => {
    expect(volatilityView([vol('a', 0)], VOLATILITY_DECAY_MS - 1)).not.toBeNull();
    expect(volatilityView([vol('a', 0)], VOLATILITY_DECAY_MS)).toBeNull();
  });
  it('a newer volatile chunk restarts the window', () => {
    const items = [vol('b', 6000), calm('x', 5000), vol('a', 0)];
    expect(volatilityView(items, 12000)?.tone).toBe('active');
    expect(volatilityView(items, 6000 + VOLATILITY_DECAY_MS)).toBeNull();
  });
  it('softens to recent after a calmer chunk', () => {
    expect(volatilityView([calm('b', 2000), vol('a', 1000)], 3000)?.tone).toBe('recent');
  });
  it('falls back to hidden_intent when no excerpt', () => {
    expect(volatilityView([vol('a', 0, '')], 1)?.trigger).toBe('x');
  });
});

describe('RISK_META', () => {
  it('has icon + text for every level; only critical is role=alert', () => {
    for (const r of ['low', 'medium', 'high', 'critical'] as const) {
      expect(RISK_META[r].icon.length).toBeGreaterThan(0);
      expect(RISK_META[r].label).toBe(r.toUpperCase());
      expect(RISK_META[r].role).toBe(r === 'critical' ? 'alert' : 'status');
    }
  });
});

describe('mitigationHistory', () => {
  const m = (id: string, text: string) => item(id, 's', {}, { mitigation_suggestion: text });
  it('dedupes: current + up to 2 distinct previous', () => {
    const h = mitigationHistory([m('4', 'A'), m('3', 'A'), m('2', 'B'), m('1', 'C'), m('0', 'D')]);
    expect(h).toEqual({ current: 'A', previous: ['B', 'C'] });
  });
  it('empty', () => {
    expect(mitigationHistory([])).toEqual({ current: null, previous: [] });
  });
});

describe('serverP50', () => {
  const l = (n: number) => item(`c${n}`, 's', {}, { processing_latency_ms: n });
  it('null when empty; median of last 20 only', () => {
    expect(serverP50([])).toBeNull();
    const many = [...Array.from({ length: 20 }, (_, i) => l(i + 1)), l(9999)];
    expect(serverP50(many)).toBe(10);
  });
});
