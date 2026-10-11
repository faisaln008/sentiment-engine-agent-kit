/** Short provider label for logs and `/health.mode` (`llm:<name>`; must match OUR_HEALTH_MODE_RE). */
export function providerName(baseUrl: string): string {
  let host = '';
  try {
    host = new URL(baseUrl).hostname.toLowerCase();
  } catch {
    return 'custom';
  }
  if (host.includes('groq')) return 'groq';
  if (host.includes('googleapis') || host.includes('google')) return 'gemini';
  if (host.includes('cerebras')) return 'cerebras';
  if (host === 'localhost' || host === '127.0.0.1') return 'ollama';
  return host.replace(/[^a-z0-9._-]/g, '-') || 'custom';
}
