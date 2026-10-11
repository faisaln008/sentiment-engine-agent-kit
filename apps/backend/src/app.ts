import type { Writable } from 'node:stream';
import Fastify, { LogController, type FastifyError, type FastifyInstance } from 'fastify';
import type { Config } from './config.js';
import { registerRoutes } from './http/routes.js';
import { heuristicClassifier } from './heuristics/rule-classifier.js';
import { readVersion } from './infra/version.js';
import type { Classifier } from './llm/classifier.js';
import type { ValidationError } from '@app/contracts';

export interface AppDeps {
  classifier?: Classifier;
  /** `/health.mode` provider; composition root passes the live value. Default `heuristic`. */
  mode?: () => string;
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
  });

  if (config.LLM_PRIMARY_API_KEY === '' && config.LLM_FALLBACK_API_KEY === '') {
    app.log.warn('no LLM API keys configured; serving heuristic results');
  }

  app.setErrorHandler((err: FastifyError, _req, reply) => {
    const status = typeof err.statusCode === 'number' ? err.statusCode : 500;
    // Never log err.message for 4xx: V8 JSON errors can quote body text. Only the code.
    if (status >= 500)
      app.log.error({ err: { name: err.name, message: err.message } }, 'unhandled error');
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

  registerRoutes(app, {
    classifier: deps.classifier ?? heuristicClassifier,
    deadlineMs: config.LLM_DEADLINE_MS,
    maxTextChars: config.MAX_TEXT_CHARS,
    mode: deps.mode ?? (() => 'heuristic'),
    onError: (e, ctx) =>
      app.log.error({ ...ctx, err: e }, 'classifier exception swallowed; heuristic used'),
    version: readVersion(),
  });
  return app;
}
