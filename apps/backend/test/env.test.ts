import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { loadEnv } from '../src/infra/env.js';

const KEYS = ['S0_TEST_FROM_FILE', 'S0_TEST_SHELL_WINS'];
afterEach(() => {
  for (const k of KEYS) delete process.env[k];
});

describe('loadEnv', () => {
  it('loads file values, shell wins, missing file is a no-op', () => {
    const p = join(mkdtempSync(join(tmpdir(), 'envtest-')), 'vars.env');
    writeFileSync(p, 'S0_TEST_FROM_FILE=file\nS0_TEST_SHELL_WINS=file\n');
    process.env['S0_TEST_SHELL_WINS'] = 'shell';
    expect(loadEnv(p)).toBe(true);
    expect(process.env['S0_TEST_FROM_FILE']).toBe('file');
    expect(process.env['S0_TEST_SHELL_WINS']).toBe('shell');
    expect(loadEnv(join(tmpdir(), 'nope-does-not-exist', 'vars.env'))).toBe(false);
  });
});
