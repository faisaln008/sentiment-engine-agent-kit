import { describe, expect, it } from 'vitest';
import { fuse } from '../src/domain/fusion.js';
import { applyRiskRules } from '../src/domain/risk.js';
import { VALENCE, volatility } from '../src/domain/volatility.js';

const base = { confidence: 0.7, risk: 'medium' as const, pitchVolatility: 0.3, threshold: 0.6 };

describe('volatility (SPEC §5.1 worked examples)', () => {
  it('example 1: prev positive -> aggressive, dz 1.5, pitch 0.8 => v 0.86, flag', () => {
    const v = volatility({
      arousalZ: 1.5,
      sentiment: 'aggressive',
      pitchVolatility: 0.8,
      prev: { arousalZ: 0, sentiment: 'positive' },
    });
    expect(v).toBeCloseTo(0.86, 6);
    const f = fuse({
      ...base,
      sentiment: 'aggressive',
      arousalZ: 1.5,
      pitchVolatility: 0.8,
      prev: { arousalZ: 0, sentiment: 'positive' },
    });
    expect(f).toMatchObject({ volatility_flag: true, v: 0.86 });
  });

  it('example 2: prev negative -> aggressive, dz 0, pitch 0.2 => v 0.16, no flag', () => {
    const input = {
      sentiment: 'aggressive' as const,
      arousalZ: 0,
      pitchVolatility: 0.2,
      prev: { arousalZ: 0, sentiment: 'negative' as const },
    };
    expect(volatility(input)).toBeCloseTo(0.16, 6);
    expect(fuse({ ...base, ...input })).toMatchObject({ volatility_flag: false, v: 0.16 });
  });

  it('first chunk of a speaker: only the pitch term (max 0.2) and never a flag', () => {
    expect(volatility({ arousalZ: 4, sentiment: 'aggressive', pitchVolatility: 1 })).toBeCloseTo(
      0.2,
      9,
    );
  });

  it('valence scale and clamp', () => {
    expect(VALENCE.positive).toBe(1);
    expect(VALENCE.aggressive).toBe(0);
    const v = volatility({
      arousalZ: 4,
      sentiment: 'aggressive',
      pitchVolatility: 1,
      prev: { arousalZ: -4, sentiment: 'positive' },
    });
    expect(v).toBeCloseTo(1, 9);
  });

  it('threshold boundary is inclusive (float-safe)', () => {
    const f = fuse({
      ...base,
      sentiment: 'neutral',
      arousalZ: 0,
      pitchVolatility: 0,
      threshold: 0.2,
      prev: { arousalZ: 1, sentiment: 'neutral' },
    });
    // 0.4 * min(1, 1/2) = 0.2 exactly
    expect(f.volatility_flag).toBe(true);
  });
});

describe('risk floors and ceilings (ADR-003 §5)', () => {
  it('aggressive >= high', () => {
    expect(applyRiskRules('low', 'aggressive', false, 0.5)).toBe('high');
    expect(applyRiskRules('medium', 'aggressive', false, 0.5)).toBe('high');
    expect(applyRiskRules('critical', 'aggressive', false, 0.5)).toBe('critical');
  });
  it('aggressive + volatility => critical', () => {
    expect(applyRiskRules('low', 'aggressive', true, 0.5)).toBe('critical');
  });
  it('positive with calibrated confidence >= 0.8 => <= medium; below 0.8 untouched', () => {
    expect(applyRiskRules('critical', 'positive', false, 0.8)).toBe('medium');
    expect(applyRiskRules('low', 'positive', false, 0.9)).toBe('low');
    expect(applyRiskRules('high', 'positive', false, 0.79)).toBe('high');
  });
  it('other sentiments are untouched', () => {
    expect(applyRiskRules('low', 'sarcastic', true, 0.9)).toBe('low');
    expect(applyRiskRules('critical', 'neutral', false, 0.99)).toBe('critical');
  });
});

describe('fusion order and calibration', () => {
  it('confidence: clamp, heuristic cap, 0.85 when delivery contradicts positive/neutral', () => {
    expect(fuse({ ...base, sentiment: 'negative', confidence: 7, arousalZ: 0 }).confidence).toBe(1);
    expect(fuse({ ...base, sentiment: 'negative', confidence: -1, arousalZ: 0 }).confidence).toBe(
      0,
    );
    expect(
      fuse({ ...base, sentiment: 'negative', confidence: 0.9, arousalZ: 0, confidenceCap: 0.6 })
        .confidence,
    ).toBe(0.6);
    expect(
      fuse({ ...base, sentiment: 'positive', confidence: 0.8, arousalZ: 1.5 }).confidence,
    ).toBe(0.68);
    expect(fuse({ ...base, sentiment: 'negative', confidence: 0.8, arousalZ: 3 }).confidence).toBe(
      0.8,
    );
  });

  it('ceiling uses the CALIBRATED confidence: raw 0.85 positive with contradicting delivery (0.72) keeps high', () => {
    const f = fuse({
      ...base,
      sentiment: 'positive',
      confidence: 0.85,
      risk: 'high',
      arousalZ: 1.6,
    });
    expect(f.confidence).toBe(0.72);
    expect(f.risk).toBe('high');
    const calm = fuse({
      ...base,
      sentiment: 'positive',
      confidence: 0.85,
      risk: 'high',
      arousalZ: 0,
    });
    expect(calm.risk).toBe('medium');
  });

  it('volatility feeds risk: aggressive + flag => critical, aggressive without flag => high', () => {
    const hot = fuse({
      ...base,
      sentiment: 'aggressive',
      risk: 'low',
      arousalZ: 1.5,
      pitchVolatility: 0.8,
      prev: { arousalZ: 0, sentiment: 'positive' },
    });
    expect(hot).toMatchObject({ volatility_flag: true, risk: 'critical' });
    const calm = fuse({
      ...base,
      sentiment: 'aggressive',
      risk: 'low',
      arousalZ: 0,
      pitchVolatility: 0.2,
      prev: { arousalZ: 0, sentiment: 'negative' },
    });
    expect(calm).toMatchObject({ volatility_flag: false, risk: 'high' });
  });
});
