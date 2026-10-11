import { describe, expect, it } from 'vitest';
import { loadConfig } from '../src/config.js';
import { buildChain } from '../src/llm/build-chain.js';

const log = { warn: () => undefined, info: () => undefined };
const noNet = (): Promise<Response> => Promise.reject(new Error('no network in tests'));
const build = (env: Record<string, string>) =>
  buildChain(loadConfig(env), noNet, log, () => undefined);

describe('boot providers (SPEC §9 only one key)', () => {
  it('no keys -> no chain, heuristic only', () => {
    expect(build({}).chain).toBeNull();
  });
  it('primary key only -> llm:groq', () => {
    const b = build({ LLM_PRIMARY_API_KEY: 'k' });
    expect(b.providers.map((p) => p.name)).toEqual(['groq']);
    expect(b.chain?.mode()).toBe('llm:groq');
  });
  it('fallback key only -> Gemini is the effective primary and /health says so', () => {
    const b = build({ LLM_FALLBACK_API_KEY: 'k' });
    expect(b.providers.map((p) => p.name)).toEqual(['gemini']);
    expect(b.chain?.mode()).toBe('llm:gemini');
  });
  it('both keys -> groq first, gemini second', () => {
    const b = build({ LLM_PRIMARY_API_KEY: 'k', LLM_FALLBACK_API_KEY: 'k2' });
    expect(b.providers.map((p) => p.name)).toEqual(['groq', 'gemini']);
    expect(b.chain?.mode()).toBe('llm:groq');
  });
});
