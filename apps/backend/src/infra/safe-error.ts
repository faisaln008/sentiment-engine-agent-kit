/**
 * Log-safe view of an error (T17/S-06): name plus a short single-line message. SyntaxError messages (JSON.parse)
 * can quote the input, so they are replaced by a fixed marker; everything else is first line, <= 100 chars.
 */
export function safeError(e: { name: string; message: string }): { name: string; message: string } {
  if (e.name === 'SyntaxError') return { name: e.name, message: '(omitted)' };
  const line = (e.message.split('\n')[0] ?? '').slice(0, 100);
  return { name: e.name, message: line };
}
