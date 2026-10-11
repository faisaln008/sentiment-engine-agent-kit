import { describe, expect, it } from 'vitest';
import { SENTIMENTS, withAcousticDefaults, type Sentiment, type Speaker } from '@app/contracts';
import { heuristicClassifier, classifyRules } from '../src/heuristics/rule-classifier.js';
import type { ClassifyInput } from '../src/llm/classifier.js';

const input = (text: string, speaker: Speaker = 'counterpart', am = {}): ClassifyInput => {
  const { values, imputed } = withAcousticDefaults(am);
  return { text, speaker, acoustics: values, imputed };
};

// Invented inputs (not from the brief).
const CASES: [Sentiment, string, Speaker][] = [
  ['positive', 'I am glad we agree, this looks great for both teams.', 'counterpart'],
  ['negative', 'This rate is too high and we have real concerns.', 'counterpart'],
  ['neutral', 'The contract covers twelve months of service.', 'counterpart'],
  ['sarcastic', 'Oh great, another surprise fee. Just what we needed.', 'counterpart'],
  ['aggressive', 'Final offer. Take it or leave it, we walk away tomorrow.', 'counterpart'],
  ['deflecting', 'Our board needs to weigh in; let us circle back next quarter.', 'counterpart'],
  ['appeasement', 'No worries at all, whatever works for you is fine.', 'candidate'],
];

describe('heuristic classifier', () => {
  it.each(CASES)('emits %s', async (label, text, speaker) => {
    const r = await heuristicClassifier.classify(
      input(text, speaker),
      new AbortController().signal,
    );
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.verdict.sentiment).toBe(label);
  });

  it('covers all 7 labels', () => {
    expect(new Set(CASES.map((c) => c[0]))).toEqual(new Set(SENTIMENTS));
  });

  it('uses word boundaries: "know" is not "no"', () => {
    expect(classifyRules(input('I know the details and they are fine.')).sentiment).toBe('neutral');
    expect(classifyRules(input('No, that does not work.')).sentiment).toBe('negative');
    expect(classifyRules(input('That is a notable result.')).sentiment).toBe('neutral');
    expect(classifyRules(input('The dashboard is ready.')).sentiment).toBe('neutral');
  });

  it('caps confidence at 0.6 and fits limits', () => {
    for (const [, text, speaker] of CASES) {
      const v = classifyRules(
        input(text, speaker, { pitch_volatility: 1, volume_intensity: 1, speech_rate_wpm: 240 }),
      );
      expect(v.confidence).toBeLessThanOrEqual(0.6);
      expect(v.hidden_intent.length).toBeLessThanOrEqual(60);
      expect(v.mitigation.length).toBeLessThanOrEqual(120);
    }
  });

  it('ultimatum is critical; deflection after a long pause is high; mitigation is speaker-aware', () => {
    expect(classifyRules(input(CASES[4]![1])).risk).toBe('critical');
    const d = CASES[5]![1];
    expect(classifyRules(input(d, 'counterpart', { pause_duration_ms: 1500 })).risk).toBe('high');
    expect(classifyRules(input(d)).risk).toBe('medium');
    expect(classifyRules(input(d, 'candidate')).mitigation).not.toBe(
      classifyRules(input(d)).mitigation,
    );
  });

  it('is fast (well under 1 ms per call)', () => {
    const i = input(CASES[3]![1]);
    classifyRules(i);
    const t = performance.now();
    for (let n = 0; n < 1000; n++) classifyRules(i);
    expect((performance.now() - t) / 1000).toBeLessThan(0.5);
  });
});
