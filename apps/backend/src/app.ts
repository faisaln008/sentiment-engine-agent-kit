import Fastify, { type FastifyInstance } from 'fastify';
import type { TelemetryResponse } from '@app/contracts';
import type { Config } from './config.js';

/** S0 skeleton: real routes arrive in S1a. References contracts so the project graph is exercised. */
export function buildApp(config: Config): FastifyInstance {
  const app = Fastify({ logger: { level: config.LOG_LEVEL }, bodyLimit: 32 * 1024 });
  app.get('/health', () => ({
    status: 'ok',
    mode: 'heuristic',
    version: '0.1.0',
    timestamp: new Date().toISOString(),
  }));
  return app;
}

export type { TelemetryResponse };
