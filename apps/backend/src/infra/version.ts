import { readFileSync } from 'node:fs';

/** Package version; apps/backend/package.json is one level above both src/ and dist/. */
export function readVersion(): string {
  try {
    const raw: unknown = JSON.parse(
      readFileSync(new URL('../../package.json', import.meta.url), 'utf8'),
    );
    const v = (raw as { version?: unknown }).version;
    return typeof v === 'string' ? v : '0.0.0';
  } catch {
    return '0.0.0';
  }
}
