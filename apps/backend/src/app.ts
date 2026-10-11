import type { Writable } from 'node:stream';
import Fastify, {
  LogController,
  type FastifyError,
  type FastifyInstance,
  type FastifyReply,
} from 'fastify';
import type { Config } from './config.js';
import { registerCors, parseOrigins } from './http/cors.js';
import { registerRoutes } from './http/routes.js';
import { WsGateway } from './http/ws-gateway.js';
import { heuristicClassifier } from './heuristics/rule-classifier.js';
import { safeError } from './infra/safe-error.js';
import { readVersion } from './infra/version.js';
import type { Classifier } from './llm/classifier.js';
import { SessionStore } from './session/session-store.js';
import { LIMITS, type ValidationError } from '@app/contracts';

export interface AppDeps {
  classifier?: Classifier;
  /** `/health.mode` provider; composition root passes the live value. Default `heuristic`. */
  mode?: () => string;
  /** Injected singleton (server.ts starts its TTL sweep); tests get a fresh private store. */
  sessions?: SessionStore;
  /** Test hook: receives pino JSON lines. */
  logStream?: Writable;
}

export function buildApp(config: Config, deps: AppDeps = {}): FastifyInstance {
  const app = Fastify({
    logger: deps.logStream
      ? { level: config.LOG_LEVEL, stream: deps.logStream }
      : { level: config.LOG_LEVEL },
    logController: new LogController({ disableRequestLogging: true }),
    bodyLimit: 32 * 1024,
    // S-03: slow-client / idle-socket bounds (no dependency). requestTimeout bounds receiving the whole request.
    connectionTimeout: 60_000,
    requestTimeout: 15_000,
    keepAliveTimeout: 30_000,
    // Router-level failures (414 id too long, bad URL) never echo the path (S-07).
    frameworkErrors: (err, _req, reply) => {
      const status: 400 | 414 = err.code === 'FST_ERR_MAX_PARAM_LENGTH' ? 414 : 400;
      const body: ValidationError = {
        error: 'invalid_request',
        issues: [{ path: '', message: status === 414 ? 'identifier too long' : 'bad request URL' }],
      };
      void (reply as FastifyReply).code(status).send(body);
    },
    // ids may be 512 chars, URL-encoded up to 12 chars each (non-ASCII): the default 100 would 414 valid ids.
    routerOptions: { maxParamLength: LIMITS.ID_MAX * 12 },
  });

  if (config.LLM_PRIMARY_API_KEY === '' && config.LLM_FALLBACK_API_KEY === '') {
    app.log.warn('no LLM API keys configured; serving heuristic results');
  }

  app.setNotFoundHandler((_req, reply) => reply.code(404).send({ error: 'not_found' })); // no path echo

  app.setErrorHandler((err: FastifyError, _req, reply) => {
    const status = typeof err.statusCode === 'number' ? err.statusCode : 500;
    // Never log err.message for 4xx: V8 JSON errors can quote body text. Only the code.
    if (status >= 500) app.log.error({ err: safeError(err) }, 'unhandled error');
    else app.log.debug({ code: err.code }, 'client error');
    if (status === 413) return reply.code(413).send({ error: 'payload_too_large' });
    if (status === 400 || status === 415) {
      const body: ValidationError = {
        error: 'invalid_request',
        issues: [
          {
            path: '',
            message:
              status === 415
                ? 'body must be JSON (Content-Type: application/json)'
                : 'malformed JSON body',
          },
        ],
      };
      return reply.code(400).send(body);
    }
    if (status < 500) return reply.code(status).send({ error: 'bad_request' });
    return reply.code(500).send({ error: 'internal_error' });
  });

  const sessions =
    deps.sessions ??
    new SessionStore({
      maxSessions: config.MAX_SESSIONS,
      ttlMs: config.SESSION_TTL_MS,
      contextTurns: config.CONTEXT_TURNS,
    });
  const mode = deps.mode ?? ((): string => 'heuristic');
  const origins = parseOrigins(config.CORS_ORIGIN);
  registerCors(app, origins);
  const gateway = new WsGateway({
    server: app.server,
    allowedOrigins: origins,
    maxClients: config.WS_MAX_CLIENTS,
    pingIntervalMs: config.WS_PING_INTERVAL_MS,
    mode,
    warn: (o, m) => app.log.warn(o, m),
  });
  app.addHook('onClose', () => {
    sessions.stop();
    gateway.close();
  });

  registerRoutes(app, {
    sessions,
    volatilityThreshold: config.VOLATILITY_THRESHOLD,
    classifier: deps.classifier ?? heuristicClassifier,
    deadlineMs: config.LLM_DEADLINE_MS,
    maxTextChars: config.MAX_TEXT_CHARS,
    mode,
    broadcast: (m) => gateway.broadcast(m),
    onError: (e, ctx) =>
      app.log.error(
        { ...ctx, err: safeError(e) },
        'classifier exception swallowed; heuristic used',
      ),
    version: readVersion(),
  });
  return app;
}
