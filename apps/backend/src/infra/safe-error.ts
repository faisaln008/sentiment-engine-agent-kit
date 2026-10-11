export interface SafeError {
  name: string;
  message: string;
  /** ZodError only: schema paths and issue codes, never input values or messages. */
  issues?: Array<{ path: string; code: string }>;
}

/**
 * Log-safe view of an error (T17/S-06): name plus a short single-line message. SyntaxError messages (JSON.parse)
 * can quote the input, so they are replaced by a fixed marker; ZodError is reduced to {path, code} per issue;
 * everything else is first line, <= 100 chars.
 */
export function safeError(e: unknown): SafeError {
  const plain = e as { name?: unknown; message?: unknown } | null;
  const err =
    e instanceof Error
      ? e
      : typeof plain?.name === 'string' && typeof plain.message === 'string'
        ? Object.assign(new Error(plain.message), { name: plain.name })
        : new Error('non-error thrown');
  const issues = (err as { issues?: unknown }).issues;
  if (err.name === 'ZodError' && Array.isArray(issues)) {
    return {
      name: err.name,
      message: 'schema validation failed',
      issues: issues.slice(0, 10).map((i: { path?: unknown; code?: unknown }) => ({
        path: Array.isArray(i.path) ? i.path.map(String).join('.') : '',
        code: typeof i.code === 'string' ? i.code : 'unknown',
      })),
    };
  }
  if (err.name === 'SyntaxError') return { name: err.name, message: '(omitted)' };
  return { name: err.name, message: (err.message.split('\n')[0] ?? '').slice(0, 100) };
}
