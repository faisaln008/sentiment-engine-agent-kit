/** Report file helpers: `reports/<name>` + dated copy in `reports/history/<ISO-time>-<label>.md`. */
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

export const REPORTS_DIR = fileURLToPath(new URL('../../../../reports/', import.meta.url));

/** Filesystem-safe ISO time, e.g. 2026-10-11T15-04-05Z. */
export const isoStamp = (d = new Date()): string =>
  d
    .toISOString()
    .replace(/\.\d+Z$/, 'Z')
    .replace(/:/g, '-');

/** Labels end up in file names: keep [a-z0-9._-]. */
export const safeLabel = (s: string): string =>
  s
    .toLowerCase()
    .replace(/[^a-z0-9._-]+/g, '-')
    .slice(0, 60) || 'run';

/** Writes reports/<name>; returns the path relative to the repo root. */
export function writeReport(name: string, content: string): string {
  const path = `${REPORTS_DIR}${name}`;
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, content);
  return `reports/${name}`;
}

/** Writes reports/history/<stamp>-<label>.md. */
export function writeHistory(stamp: string, label: string, content: string): string {
  const name = `history/${stamp}-${safeLabel(label)}.md`;
  return writeReport(name, content);
}

/** Markdown table; cells are escaped for `|` and newlines. */
export function table(head: readonly string[], rows: readonly (readonly string[])[]): string {
  const esc = (c: string): string => c.replace(/\|/g, '\\|').replace(/\n/g, ' ');
  const line = (cells: readonly string[]): string => `| ${cells.map(esc).join(' | ')} |`;
  return [line(head), line(head.map(() => '---')), ...rows.map(line)].join('\n');
}

export const pct = (x: number, d = 1): string =>
  Number.isFinite(x) ? `${(100 * x).toFixed(d)}%` : 'n/a';
export const num = (x: number, d = 2): string => (Number.isFinite(x) ? x.toFixed(d) : 'n/a');
export const ms = (x: number): string => (Number.isFinite(x) ? `${Math.round(x)}` : 'n/a');
