import { fileURLToPath } from 'node:url';
import { buildApp } from './app.js';
import { loadConfig } from './config.js';
import { loadEnv } from './infra/env.js';

// Repo root is three levels up from both src/ and dist/ (apps/backend/{src,dist}/server.*).
loadEnv(fileURLToPath(new URL('../../../.env', import.meta.url)));

const config = loadConfig();
const app = buildApp(config);
await app.listen({ port: config.PORT, host: '0.0.0.0' });
