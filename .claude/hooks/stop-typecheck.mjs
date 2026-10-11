#!/usr/bin/env node
// Stop / SubagentStop: an agent may not declare "done" while the workspace fails typecheck.
// Uses stop_hook_active to avoid infinite loops: second consecutive block is let through
// (the agent then has to report the failure honestly, which the reviewer will catch).
import { readFileSync, existsSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { join } from 'node:path';

let input = {};
try { input = JSON.parse(readFileSync(0, 'utf8')); } catch { /* ignore */ }
if (input.stop_hook_active) process.exit(0);

const projectDir = process.env.CLAUDE_PROJECT_DIR ?? input.cwd ?? process.cwd();
if (!existsSync(join(projectDir, 'node_modules')) || !existsSync(join(projectDir, 'package.json'))) process.exit(0);

// Skip if no TS changed in the working tree (cheap check; keeps spec/docs agents fast).
const diff = spawnSync('git', ['status', '--porcelain'], { cwd: projectDir, encoding: 'utf8' });
if (diff.status === 0 && !/\.(ts|tsx|mts)\s*$/m.test(diff.stdout)) process.exit(0);

const r = spawnSync('npm', ['run', '--silent', 'typecheck'], { cwd: projectDir, encoding: 'utf8' });
if (r.status !== 0) {
  const out = `${r.stdout ?? ''}${r.stderr ?? ''}`.trim().split('\n').slice(-40).join('\n');
  process.stderr.write(`Typecheck is red — you are not done. Fix these errors (or report them as a blocker):\n${out}\n`);
  process.exit(2);
}
process.exit(0);
