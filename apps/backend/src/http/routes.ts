import type { FastifyInstance } from 'fastify';
import { TelemetryRequestSchema, LIMITS, type ValidationError } from '@app/contracts';
import { analyzeChunk, type AnalyzeDeps } from '../services/analyze-chunk.js';

export interface RouteDeps extends AnalyzeDeps {
  mode: () => string;
  version: string;
}

const MAX_WARNED_SESSIONS = 1000;

function rawSpeaker(body: unknown): unknown {
  return body !== null && typeof body === 'object'
    ? (body as Record<string, unknown>)['speaker']
    : undefined;
}

export function registerRoutes(app: FastifyInstance, deps: RouteDeps): void {
  // Bounded "warned once per session" memory; lives inside this closure, not module scope.
  const warned = new Set<string>();

  app.get('/health', () => ({
    status: 'ok' as const,
    mode: deps.mode(),
    version: deps.version,
    timestamp: Date.now(),
  }));

  app.post(
    '/api/telemetry/stream',
    { bodyLimit: LIMITS.BODY_LIMIT_BYTES },
    async (request, reply) => {
      const t0 = performance.now();
      const parsed = TelemetryRequestSchema.safeParse(request.body);
      if (!parsed.success) {
        const body: ValidationError = {
          error: 'invalid_request',
          issues: parsed.error.issues.map((i) => ({
            path: i.path.map(String).join('.'),
            message: i.message,
          })),
        };
        return reply.code(400).send(body);
      }
      const req = parsed.data;

      const raw = rawSpeaker(request.body);
      const known =
        typeof raw === 'string' && ['candidate', 'counterpart'].includes(raw.trim().toLowerCase());
      if (!known && !warned.has(req.session_id)) {
        if (warned.size >= MAX_WARNED_SESSIONS) warned.clear();
        warned.add(req.session_id);
        request.log.warn(
          { chunk_id: req.chunk_id, session_id: req.session_id, speaker_type: typeof raw },
          'unknown or missing speaker; treating as counterpart',
        );
      }

      const out = await analyzeChunk(req, deps, t0);
      request.log.info(
        {
          chunk_id: req.chunk_id,
          session_id: req.session_id,
          provider: out.provider,
          latency_ms: out.response.processing_latency_ms,
          outcome: out.outcome,
        },
        'chunk',
      );
      return reply.code(200).send(out.response);
    },
  );
}
