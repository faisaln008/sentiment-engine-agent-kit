import type { FastifyInstance } from 'fastify';
import { TelemetryRequestSchema, LIMITS, type ValidationError } from '@app/contracts';
import { analyzeChunk, type AnalyzeDeps } from '../services/analyze-chunk.js';
import type { SessionStore } from '../session/session-store.js';

export interface RouteDeps extends AnalyzeDeps {
  mode: () => string;
  version: string;
  sessions: SessionStore;
}

function rawSpeaker(body: unknown): unknown {
  return body !== null && typeof body === 'object'
    ? (body as Record<string, unknown>)['speaker']
    : undefined;
}

export function registerRoutes(app: FastifyInstance, deps: RouteDeps): void {
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
      if (!known && deps.sessions.shouldWarnUnknownSpeaker(req.session_id)) {
        request.log.warn(
          { chunk_id: req.chunk_id, session_id: req.session_id, speaker_type: typeof raw },
          'unknown or missing speaker; treating as counterpart',
        );
      }

      // Lock-free snapshot at arrival (ADR-004); the chunk being analysed is never in its own baseline.
      const snap = deps.sessions.snapshot(req.session_id, req.timestamp_ms, req.chunk_id);
      const out = await analyzeChunk(req, deps, t0, snap);
      reply.code(200).send(out.response);
      // Same tick as send(), no await in between (ADR-004): the next chunk already sees this one.
      deps.sessions.commit(req.session_id, out.record);
      request.log.info(
        {
          chunk_id: req.chunk_id,
          session_id: req.session_id,
          provider: out.provider,
          latency_ms: out.response.processing_latency_ms,
          outcome: out.outcome,
          ...(out.reason === undefined ? {} : { reason: out.reason }),
          ...(out.finish_reason === undefined ? {} : { finish_reason: out.finish_reason }),
          ...(out.skip === undefined ? {} : { skip: out.skip }),
        },
        'chunk',
      );
      return reply;
    },
  );
}
