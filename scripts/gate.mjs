#!/usr/bin/env node
// Quality gate: typecheck → lint → test → (if backend reachable) eval:smoke + bench budget check.
// Exit non-zero on the first failure. Agents must paste the summary into their handoff.
import { spawnSync } from 'node:child_process';
import { readFileSync, existsSync } from 'node:fs';

const P50_BUDGET = Number(process.env.GATE_P50_MS ?? 250);
const P95_BUDGET = Number(process.env.GATE_P95_MS ?? 500);
const results = [];

function step(name, cmd, args) {
  const t = Date.now();
  const r = spawnSync(cmd, args, { stdio: 'inherit', shell: process.platform === 'win32' });
  results.push({ name, ok: r.status === 0, s: ((Date.now() - t) / 1000).toFixed(1) });
  if (r.status !== 0) finish(1);
}

async function backendUp() {
  try { return (await fetch('http://localhost:3000/health', { signal: AbortSignal.timeout(800) })).ok; }
  catch { return false; }
}

function finish(code) {
  console.log('\n── gate summary ──');
  for (const r of results) console.log(`${r.ok ? 'PASS' : 'FAIL'}  ${r.name.padEnd(12)} ${r.s}s`);
  process.exit(code);
}

step('typecheck', 'npm', ['run', '--silent', 'typecheck']);
step('lint', 'npm', ['run', '--silent', 'lint']);
step('test', 'npm', ['test', '--silent']);

if (await backendUp()) {
  step('eval:smoke', 'npm', ['run', '--silent', 'eval:smoke']);
  step('bench', 'npm', ['run', '--silent', 'bench', '--', '--quick']);
  // bench.ts must write a machine-readable line: `<!-- metrics {"p50":123,"p95":234} -->`
  const f = 'reports/bench-latest.md';
  if (existsSync(f)) {
    const m = readFileSync(f, 'utf8').match(/<!-- metrics (\{.*\}) -->/);
    if (m) {
      const { p50, p95 } = JSON.parse(m[1]);
      const ok = p50 <= P50_BUDGET && p95 <= P95_BUDGET;
      results.push({ name: `latency p50=${p50} p95=${p95}`, ok, s: '-' });
      if (!ok) finish(1);
    }
  }
} else {
  results.push({ name: 'eval/bench SKIPPED (backend not on :3000)', ok: true, s: '-' });
}
finish(0);
