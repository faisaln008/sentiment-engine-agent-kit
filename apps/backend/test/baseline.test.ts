import { describe, expect, it } from 'vitest';
import type { AcousticField, AcousticMetadata } from '@app/contracts';
import {
  arousalZ,
  describeAcoustics,
  describeZ,
  emptyBaseline,
  observe,
  zScore,
  zScores,
} from '../src/domain/acoustic-baseline.js';

const A = (o: Partial<AcousticMetadata> = {}): AcousticMetadata => ({
  pitch_volatility: 0.35,
  speech_rate_wpm: 150,
  pause_duration_ms: 400,
  volume_intensity: 0.5,
  ...o,
});

describe('baseline', () => {
  it('baseline.priors: fewer than 2 observed values use SPEC §4 priors', () => {
    const z = zScores(emptyBaseline(), A({ speech_rate_wpm: 180 }), []);
    expect(z.speech_rate_wpm).toBeCloseTo(1, 6); // (180-150)/30
    const one = observe(emptyBaseline(), A({ speech_rate_wpm: 120 }), []);
    expect(zScores(one, A({ speech_rate_wpm: 180 }), []).speech_rate_wpm).toBeCloseTo(1, 6);
  });

  it('baseline.sample-std (T9): n-1 divisor, matches the eval oracle', () => {
    let b = emptyBaseline();
    for (const w of [100, 140, 180]) b = observe(b, A({ speech_rate_wpm: w }), []);
    // mean 140, sample std = sqrt(((40)^2+0+(40)^2)/2) = 40 (population std would be 32.66)
    expect(b.speech_rate_wpm.mean).toBeCloseTo(140, 9);
    expect(zScore(b.speech_rate_wpm, 'speech_rate_wpm', 220)).toBeCloseTo(2, 6);
  });

  it('baseline.std-floor and z clamp', () => {
    let b = emptyBaseline();
    for (let i = 0; i < 5; i++) b = observe(b, A({ speech_rate_wpm: 150 }), []);
    // std 0 -> floored at 0.5 * 30 = 15
    expect(zScore(b.speech_rate_wpm, 'speech_rate_wpm', 165)).toBeCloseTo(1, 6);
    expect(zScore(b.speech_rate_wpm, 'speech_rate_wpm', 900)).toBe(4);
    expect(zScore(b.speech_rate_wpm, 'speech_rate_wpm', -900)).toBe(-4);
  });

  it('baseline.imputed fields are skipped by observe() and contribute z=0', () => {
    const imputed: AcousticField[] = ['pitch_volatility'];
    const b = observe(emptyBaseline(), A({ pitch_volatility: 0.9 }), imputed);
    expect(b.pitch_volatility.n).toBe(0);
    expect(b.speech_rate_wpm.n).toBe(1);
    expect(zScores(emptyBaseline(), A({ pitch_volatility: 0.9 }), imputed).pitch_volatility).toBe(
      0,
    );
  });

  it('baseline.arousal is the mean of pitch, rate, volume z (pause excluded)', () => {
    const z = zScores(
      emptyBaseline(),
      A({
        pitch_volatility: 0.75,
        speech_rate_wpm: 180,
        volume_intensity: 0.8,
        pause_duration_ms: 5000,
      }),
      [],
    );
    expect(arousalZ(z)).toBeCloseTo((2 + 1 + 2) / 3, 6);
  });

  it('baseline.descriptors: bands and long pause', () => {
    expect(describeZ(0.5)).toBe('normal');
    expect(describeZ(1.5)).toBe('higher');
    expect(describeZ(-2.5)).toBe('much lower');
    expect(describeAcoustics(A({ pause_duration_ms: 1200 }), [])).toContain('pause long (1.2s)');
    expect(describeAcoustics(A(), ['pause_duration_ms'])).toContain('pause unknown');
    // same 187 wpm reads differently for a fast talker vs priors
    let fast = emptyBaseline();
    for (const w of [185, 190, 188, 186]) fast = observe(fast, A({ speech_rate_wpm: w }), []);
    expect(describeAcoustics(A({ speech_rate_wpm: 187 }), [], fast)).toContain('pace normal');
    expect(describeAcoustics(A({ speech_rate_wpm: 187 }), [])).toContain('pace higher');
  });
});
