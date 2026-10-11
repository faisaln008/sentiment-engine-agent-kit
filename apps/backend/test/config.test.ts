import { describe, expect, it } from 'vitest';
import { loadConfig } from '../src/config.js';

describe('config', () => {
  it('loads defaults with no env (no keys is fine)', () => {
    const c = loadConfig({});
    expect(c.PORT).toBe(3000);
    expect(c.LLM_PRIMARY_API_KEY).toBe('');
  });
  it('coerces numbers', () => {
    expect(loadConfig({ LLM_DEADLINE_MS: '300' }).LLM_DEADLINE_MS).toBe(300);
  });
  it('treats empty strings as unset', () => {
    const c = loadConfig({ PORT: '', LLM_DEADLINE_MS: '  ', LOG_LEVEL: '', LLM_PRIMARY_MODEL: '' });
    expect(c.PORT).toBe(3000);
    expect(c.LLM_DEADLINE_MS).toBe(450);
    expect(c.LOG_LEVEL).toBe('info');
    expect(c.LLM_PRIMARY_MODEL).toBe('llama-3.1-8b-instant');
  });
  it('rejects out-of-range values with a readable message', () => {
    expect(() => loadConfig({ LLM_DEADLINE_MS: '0' })).toThrow(/LLM_DEADLINE_MS/);
    expect(() => loadConfig({ VOLATILITY_THRESHOLD: '1.5' })).toThrow(/VOLATILITY_THRESHOLD/);
    expect(() => loadConfig({ LOG_LEVEL: 'loud' })).toThrow(/LOG_LEVEL: must be one of/);
    expect(() => loadConfig({ PORT: '70000' })).toThrow(/PORT/);
  });
});
