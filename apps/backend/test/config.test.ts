import { describe, expect, it } from 'vitest';
import { loadConfig } from '../src/config.js';
import { buildApp } from '../src/app.js';

describe('config', () => {
  it('loads defaults with no env (no keys is fine)', () => {
    const c = loadConfig({});
    expect(c.PORT).toBe(3000);
    expect(c.LLM_PRIMARY_API_KEY).toBe('');
  });
  it('coerces numbers', () => {
    expect(loadConfig({ LLM_DEADLINE_MS: '300' }).LLM_DEADLINE_MS).toBe(300);
  });
});

describe('skeleton', () => {
  it('serves /health', async () => {
    const app = buildApp(loadConfig({ LOG_LEVEL: 'silent' }));
    const res = await app.inject({ url: '/health' });
    expect(res.statusCode).toBe(200);
    expect(res.json().status).toBe('ok');
  });
});
