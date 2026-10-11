import type { FastifyInstance } from 'fastify';

/** `CORS_ORIGIN` may hold several comma-separated origins. No wildcard is ever produced. */
export function parseOrigins(raw: string): string[] {
  return raw
    .split(',')
    .map((o) => o.trim())
    .filter((o) => o !== '' && o !== '*');
}

/** Exact-match allow-list CORS for the HTTP routes (no dependency). Other origins get no CORS headers. */
export function registerCors(app: FastifyInstance, allowed: readonly string[]): void {
  app.addHook('onRequest', async (req, reply) => {
    const origin = req.headers.origin;
    if (typeof origin !== 'string') return;
    void reply.header('vary', 'Origin'); // caches must key on Origin whenever one was sent
    if (!allowed.includes(origin)) return;
    void reply.header('access-control-allow-origin', origin);
    if (req.method === 'OPTIONS') {
      return reply
        .header('access-control-allow-methods', 'GET,POST,OPTIONS')
        .header('access-control-allow-headers', 'content-type')
        .header('access-control-max-age', '600')
        .code(204)
        .send();
    }
    return;
  });
}
