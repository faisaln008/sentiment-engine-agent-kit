#!/usr/bin/env node
// PreToolUse(Write|Edit|MultiEdit): block writes to secret files / the assignment brief,
// and block content that looks like a real API key. Exit 2 = block, stderr is shown to Claude.
import { readFileSync } from 'node:fs';
import { basename, relative, resolve } from 'node:path';

const raw = readFileSync(0, 'utf8');
let input;
try { input = JSON.parse(raw); } catch { process.exit(0); } // never brick the session on bad input

const ti = input.tool_input ?? {};
const projectDir = process.env.CLAUDE_PROJECT_DIR ?? input.cwd ?? process.cwd();
const filePath = ti.file_path ?? '';
const rel = filePath ? relative(projectDir, resolve(projectDir, filePath)).replaceAll('\\', '/') : '';
const name = basename(rel);

const block = (msg) => { process.stderr.write(`BLOCKED by guard-secrets: ${msg}\n`); process.exit(2); };

// 1. Protected paths
if (/^\.env(\..+)?$/.test(name) && name !== '.env.example') {
  block(`writing "${rel}" is forbidden. Only .env.example (variable NAMES, no values) may be edited.`);
}
if (rel.startsWith('docs/assignment/')) block('the assignment brief is read-only and must not be modified.');
if (/^\.claude\/(hooks|agents|skills|commands)\//.test(rel) || rel === '.claude/settings.json') {
  block('agent guardrails, agent prompts and skills (.claude/**) are human-owned. Write a proposal to .agent-work/requests/ instead.');
}

// 2. Secret-looking content
const chunks = [ti.content, ti.new_string, ...(Array.isArray(ti.edits) ? ti.edits.map((e) => e?.new_string) : [])]
  .filter((s) => typeof s === 'string');
const patterns = [
  [/gsk_[A-Za-z0-9]{20,}/, 'Groq API key'],
  [/AIza[0-9A-Za-z_\-]{30,}/, 'Google API key'],
  [/\bsk-(proj-)?[A-Za-z0-9_\-]{20,}/, 'OpenAI-style key'],
  [/\bcsk-[A-Za-z0-9]{20,}/, 'Cerebras key'],
  [/-----BEGIN (RSA |EC )?PRIVATE KEY-----/, 'private key'],
  [/(API_KEY|SECRET|TOKEN)\s*=\s*['"]?[A-Za-z0-9_\-]{24,}/, 'hard-coded credential assignment'],
];
for (const text of chunks) {
  for (const [re, label] of patterns) {
    if (re.test(text)) block(`content contains what looks like a ${label}. Use config.ts + .env, never literals.`);
  }
}
process.exit(0);
