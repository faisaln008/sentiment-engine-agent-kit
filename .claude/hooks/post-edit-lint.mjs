#!/usr/bin/env node
// PostToolUse(Write|Edit|MultiEdit): format + lint ONLY the touched TS file (fast feedback, < ~3s).
// Full typecheck runs at Stop/SubagentStop. Exit 2 feeds lint errors back to Claude.
import { readFileSync, existsSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { join, resolve } from 'node:path';

let input;
try { input = JSON.parse(readFileSync(0, 'utf8')); } catch { process.exit(0); }
const projectDir = process.env.CLAUDE_PROJECT_DIR ?? input.cwd ?? process.cwd();
const file = input.tool_input?.file_path;
if (!file || !/\.(ts|tsx|mts)$/.test(file)) process.exit(0);

const abs = resolve(projectDir, file);
const bin = (n) => join(projectDir, 'node_modules', '.bin', n);
if (!existsSync(abs)) process.exit(0);

if (existsSync(bin('prettier'))) {
  spawnSync(bin('prettier'), ['--write', '--log-level', 'silent', abs], { cwd: projectDir });
}
if (existsSync(bin('eslint'))) {
  const r = spawnSync(bin('eslint'), ['--fix', '--max-warnings=0', abs], { cwd: projectDir, encoding: 'utf8' });
  if (r.status !== 0) {
    const out = `${r.stdout ?? ''}${r.stderr ?? ''}`.trim().split('\n').slice(-40).join('\n');
    process.stderr.write(`eslint failed for ${file} — fix before continuing:\n${out}\n`);
    process.exit(2);
  }
}
process.exit(0);
