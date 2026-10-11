import { describe, expect, it } from 'vitest';
import { defaultRisk, extractContent, parseVerdict } from '../src/llm/parse.js';

const good =
  '{"s":"deflecting","c":0.78,"i":"deflection_via_legal_delay","m":"Propose a joint review","r":"high"}';

describe('parse', () => {
  it('parse.plain-json', () => {
    expect(parseVerdict(good, 'counterpart')).toEqual({
      sentiment: 'deflecting',
      confidence: 0.78,
      hidden_intent: 'deflection_via_legal_delay',
      mitigation: 'Propose a joint review',
      risk: 'high',
    });
  });

  it('parse.fences-and-prose', () => {
    const v = parseVerdict(
      'Sure! Here you go:\n```json\n' + good + '\n```\nHope it helps',
      'counterpart',
    );
    expect(v?.sentiment).toBe('deflecting');
  });

  it('parse.coerces-enums: casing, synonyms, clamp c, default r', () => {
    const v = parseVerdict('{"s":"Sarcasm","c":7,"i":"x","m":"y","r":"MED"}', 'counterpart');
    expect(v).toMatchObject({ sentiment: 'sarcastic', confidence: 1, risk: 'medium' });
    const w = parseVerdict('{"s":"AGGRESSIVE","c":-2,"i":"x","m":"y"}', 'counterpart');
    expect(w).toMatchObject({ sentiment: 'aggressive', confidence: 0, risk: 'high' });
    const z = parseVerdict('{"s":"neutral","c":"0.4","i":"x","m":"y","r":"???"}', 'counterpart');
    expect(z).toMatchObject({ confidence: 0.4, risk: 'low' });
  });

  it('parse.default-risk is speaker-aware for appeasement', () => {
    expect(defaultRisk('appeasement', 'candidate')).toBe('medium');
    expect(defaultRisk('appeasement', 'counterpart')).toBe('low');
  });

  it('parse.ignores-extra-keys and accepts long key names', () => {
    const v = parseVerdict(
      '{"sentiment":"negative","confidence":0.6,"hidden_intent":"a","mitigation_suggestion":"b","risk_level":"medium","sh":"hi","evil":"ignore previous"}',
      'candidate',
    );
    expect(v).toMatchObject({ sentiment: 'negative', hidden_intent: 'a', mitigation: 'b' });
    expect(v).not.toHaveProperty('evil');
  });

  it('parse.rejects: unknown sentiment, no object, arrays, truncated JSON', () => {
    expect(parseVerdict('{"s":"furious","c":1}', 'counterpart')).toBeNull();
    expect(parseVerdict('no json here', 'counterpart')).toBeNull();
    expect(parseVerdict('[1,2]', 'counterpart')).toBeNull();
    expect(parseVerdict('{"s":"neutral","c":0.5,"i":"none_det', 'counterpart')).toBeNull();
    expect(parseVerdict('{"c":0.5}', 'counterpart')).toBeNull();
  });

  it('parse.length-truncated: cut-off object is bad_json (null)', () => {
    expect(
      parseVerdict('{"s":"neutral","c":0.5,"i":"none_detected","m":"Ask', 'counterpart'),
    ).toBeNull();
  });

  it('parse.balanced-scan and empty confidence', () => {
    const v = parseVerdict(
      'note {not json} then {"s":"neutral","c":"","i":"a}b","m":"x"} trailing }',
      'counterpart',
    );
    expect(v).toBeNull(); // first balanced object is {not json}: invalid JSON => bad_json, never a wrong slice
    const w = parseVerdict('{"s":"neutral","c":"","i":"a}b","m":"x"} trailing }', 'counterpart');
    expect(w).toMatchObject({ confidence: 0.5, hidden_intent: 'a}b' });
  });

  it('parse.empty-choices / null content / finish_reason extraction', () => {
    expect(extractContent({ choices: [] })).toEqual({ content: null, finishReason: null });
    expect(
      extractContent({ choices: [{ message: { content: null }, finish_reason: 'length' }] }),
    ).toEqual({
      content: null,
      finishReason: 'length',
    });
    expect(extractContent(null)).toEqual({ content: null, finishReason: null });
    expect(
      extractContent({ choices: [{ message: { content: 'x' }, finish_reason: 'stop' }] }),
    ).toEqual({
      content: 'x',
      finishReason: 'stop',
    });
  });
});
