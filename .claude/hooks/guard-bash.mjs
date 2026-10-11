#!/usr/bin/env node
// PreToolUse(Bash): defence in depth on top of settings.json deny rules
// (permission prefixes are easy to bypass with `cd x && ...`, pipes or env prefixes).
import { readFileSync } from 'node:fs';

let input;
try { input = JSON.parse(readFileSync(0, 'utf8')); } catch { process.exit(0); }
const cmd = String(input.tool_input?.command ?? '');

const rules = [
  [/\bgit\s+push\b/, 'git push is human-only.'],
  [/\bgit\s+(commit|push)\b[^\n]*--no-verify/, '--no-verify bypasses quality gates.'],
  [/\bgit\s+reset\s+--hard\b/, 'git reset --hard destroys work; ask the human.'],
  [/\brm\s+-[a-zA-Z]*r[a-zA-Z]*f?\s+(\/|~|\$HOME|\.git\b|\.\s*$|\*)/, 'destructive rm on a protected path.'],
  // Any reference to a real env file. `cp .env.example .env` (setup step) is stripped before matching.
  [/(^|[\s/'"=<])\.env(\.[a-z]+)?(?=$|[\s'";|&)>])/, 'touching .env from the shell is forbidden (agents may only use .env.example).'],
  [/(^|[;&|]\s*)(printenv|env)\s*($|\||>)/,'dumping the environment can leak API keys.'],
  [/echo\s+[^\n]*\$\{?[A-Z_]*(API_KEY|SECRET|TOKEN)/, 'echoing secrets is forbidden.'],
  [/\bnpm\s+publish\b/, 'publishing is forbidden.'],
  [/curl\s[^\n]*(api\.groq\.com|generativelanguage\.googleapis\.com|api\.cerebras\.ai|api\.openai\.com)/, 'call LLM providers through the app/eval code, not ad-hoc curl (keys would land in shell history/logs).'],
];
const scrubbed = cmd.replace(/\bcp\s+\.env\.example\s+\.env(?=$|[\s;&|])/g, '').replace(/\.env\.example\b/g, '');
for (const [re, why] of rules) {
  if (re.test(scrubbed)) {
    process.stderr.write(`BLOCKED by guard-bash: ${why}\nCommand: ${cmd.slice(0, 200)}\n`);
    process.exit(2);
  }
}
process.exit(0);
