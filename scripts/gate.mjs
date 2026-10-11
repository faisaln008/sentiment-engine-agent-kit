#!/usr/bin/env node
// Quality gate: typecheck → lint → test → (if backend reachable) eval:smoke + bench budget check.
// Exit non-zero on the first failure. Agents must paste the summary into their handoff.
import { spawnSync } from 'node:child_process';
import { readFileSync, existsSync, rmSync } from 'node:fs';

const P50_BUDGET = Number(process.env.GATE_P50_MS ?? 250);
const P95_BUDGET = Number(process.env.GATE_P95_MS ?? 500);
const results = [];

function step(name, cmd, args) {
  const t = Date.now();
  const r = spawnSync(cmd, args, { stdio: 'inherit', shell: process.platform === 'win32' });
  results.push({ name, ok: r.status === 0, s: ((Date.now() - t) / 1000).toFixed(1) });
  if (r.status !== 0) finish(1);
}

const TARGET = (process.env.GATE_TARGET ?? 'http://localhost:3000').replace(/\/+$/, '');
// Mirrors OUR_HEALTH_MODE_RE in packages/contracts (a foreign app answering 200 must not pass the probe).
const OUR_HEALTH_MODE_RE = /^(llm:[a-z0-9._-]+|heuristic)$/;

async function backendUp() {
  try {
    const res = await fetch(`${TARGET}/health`, { signal: AbortSignal.timeout(800) });
    if (!res.ok) return false;
    const j = await res.json();
    return j?.status === 'ok' && typeof j.mode === 'string' && OUR_HEALTH_MODE_RE.test(j.mode);
  } catch {
    return false;
  }
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
  step('eval:smoke', 'npm', ['run', '--silent', 'eval:smoke', '--', '--target', TARGET]);
  // Quick runs write reports/bench-quick.md; remove any stale file so a skipped write cannot pass the gate.
  const f = 'reports/bench-quick.md';
  rmSync(f, { force: true });
  step('bench', 'npm', ['run', '--silent', 'bench', '--', '--quick', '--target', TARGET]);
  const m = existsSync(f) ? readFileSync(f, 'utf8').match(/<!-- metrics (\{.*\}) -->/) : null;
  if (!m) {
    results.push({ name: 'latency metrics MISSING in reports/bench-quick.md', ok: false, s: '-' });
    finish(1);
  }
  const { p50, p95, errors = 0, valid_for_latency: valid } = JSON.parse(m[1]);
  const ok = p50 <= P50_BUDGET && p95 <= P95_BUDGET && !(errors > 0) && valid !== false;
  results.push({ name: `latency p50=${p50} p95=${p95} errors=${errors} valid=${valid}`, ok, s: '-' });
  if (!ok) finish(1);
} else {
  results.push({ name: `eval/bench SKIPPED (no backend at ${TARGET})`, ok: true, s: '-' });
}
finish(0);
