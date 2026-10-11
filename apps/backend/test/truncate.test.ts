import { describe, expect, it } from 'vitest';
import { truncate } from '../src/domain/truncate.js';

describe('truncate', () => {
  it('returns short input unchanged', () => {
    expect(truncate('short text', 60)).toBe('short text');
  });
  it('cuts on a word boundary at 120 and never appends an ellipsis', () => {
    const s = Array.from({ length: 40 }, () => 'word').join(' ');
    const out = truncate(s, 120);
    expect(out.length).toBeLessThanOrEqual(120);
    expect(out.endsWith('word')).toBe(true);
    expect(out).not.toContain('…');
    expect(out).not.toContain('...');
  });
  it('cuts snake_case intents on an underscore boundary at 60', () => {
    const s = 'deflection_via_legal_review_delay_and_procurement_alignment_loop';
    const out = truncate(s, 60, { underscore: true });
    expect(out.length).toBeLessThanOrEqual(60);
    expect(out).toBe('deflection_via_legal_review_delay_and_procurement_alignment');
  });
  it('hard-cuts when no separator lies in the last 40% of the window', () => {
    const s = 'ab ' + 'x'.repeat(100);
    expect(truncate(s, 60)).toBe(s.slice(0, 60));
  });
  it('allows exactly max chars and strips trailing punctuation after a cut', () => {
    expect(truncate('a'.repeat(60), 60)).toHaveLength(60);
    expect(truncate('Ask for a date, and then confirm the owner - ' + 'z'.repeat(30), 46)).toBe(
      'Ask for a date, and then confirm the owner',
    );
  });
  it('returns empty when nothing survives', () => {
    expect(truncate('   ', 60)).toBe('');
  });
});
