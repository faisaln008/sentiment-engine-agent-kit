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

  it('T1 negation: "not good" is negative, "not bad at all" is positive, negated walk-away is not an ultimatum', () => {
    expect(classifyRules(input('This is not good for our budget.')).sentiment).toBe('negative');
    expect(classifyRules(input('The rollout was not bad at all.')).sentiment).toBe('positive');
    expect(
      classifyRules(input("We don't want to walk away from this partnership.")).sentiment,
    ).not.toBe('aggressive');
    expect(classifyRules(input('We will walk away unless this changes.')).sentiment).toBe(
      'aggressive',
    );
  });

  it('T2 over-broad markers: sincere or incidental uses are not flagged', () => {
    expect(
      classifyRules(input('Great, we can sign today if the paperwork is ready.')).sentiment,
    ).not.toBe('aggressive');
    expect(
      classifyRules(input('You never know with migrations, so keep a buffer.')).sentiment,
    ).not.toBe('aggressive');
    expect(classifyRules(input('Thanks a lot for the quick turnaround.')).sentiment).not.toBe(
      'sarcastic',
    );
    expect(classifyRules(input('Please make sure the invoice is attached.')).sentiment).not.toBe(
      'sarcastic',
    );
    expect(classifyRules(input('Legal approved the draft yesterday.')).sentiment).not.toBe(
      'deflecting',
    );
    expect(classifyRules(input('Welcome on board, kickoff is Monday.')).sentiment).not.toBe(
      'deflecting',
    );
    expect(classifyRules(input('The steering group needs to weigh in first.')).sentiment).toBe(
      'deflecting',
    );
    expect(classifyRules(input('Sign by Friday or we revisit the whole plan.')).sentiment).toBe(
      'aggressive',
    );
  });

  it('B2 regression probes: benign speech is not flagged as aggressive/sarcastic/deflecting/appeasement', () => {
    const not = (text: string, bad: Sentiment): void =>
      expect(classifyRules(input(text)).sentiment, text).not.toBe(bad);
    not('We can do either the annual or the monthly plan, whichever you prefer.', 'aggressive');
    not('Either Tuesday or Wednesday works for the kickoff call.', 'aggressive');
    not('Wow, that is a great offer, thank you.', 'sarcastic');
    not('Thanks for being so flexible with the schedule.', 'sarcastic');
    not('I suppose that could work for us.', 'sarcastic');
    not("That's not good enough for us, but let's keep talking.", 'aggressive');
    not('We understand your concern and will look at the numbers.', 'appeasement');
    not('Trust me, this is the best tier for your team size.', 'deflecting');
    not("I'm sorry, but that price is unacceptable.", 'appeasement');
  });

  it('kept families fire (reworded, invented): consequence ultimatum, deferral, concession, apology', () => {
    const is = (text: string, want: Sentiment, speaker: Speaker = 'counterpart'): void =>
      expect(classifyRules(input(text, speaker)).sentiment, text).toBe(want);
    is('Either you cut the fee or we walk from this deal.', 'aggressive');
    is('We are wasting my time with these revisions.', 'aggressive');
    is('Let me circle back with you sometime next week.', 'deflecting');
    is('I am looking into it and will revert shortly.', 'deflecting');
    is('We are so sorry for the confusion on our side.', 'appeasement', 'candidate');
    is('Let me see what I can do about the rate.', 'appeasement', 'candidate');
  });

  it("N3: negated walk-away covers won't / will not / wouldn't", () => {
    for (const t of [
      "We won't walk away over a small delay.",
      'We will not walk away from this.',
      "We wouldn't walk away now.",
    ])
      expect(classifyRules(input(t)).sentiment, t).not.toBe('aggressive');
  });
});

describe('heuristic uses speaker-baseline arousal (T4)', () => {
  it('arousalZ from the session baseline replaces the population-prior arousal', () => {
    const blame = 'That is your fault, honestly.';
    const base = (z: number) => ({ ...input(blame), arousalZ: z });
    expect(classifyRules(base(0)).risk).toBe('high');
    expect(classifyRules(base(2)).risk).toBe('critical');
    // acoustics that look "hot" against population priors are calm for a fast talker (z = 0)
    const loud = { speech_rate_wpm: 260, pitch_volatility: 0.9, volume_intensity: 0.95 };
    expect(classifyRules({ ...input(blame, 'counterpart', loud), arousalZ: 0 }).risk).toBe('high');
    expect(classifyRules(input(blame, 'counterpart', loud)).risk).toBe('critical');
  });
});
