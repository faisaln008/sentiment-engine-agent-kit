import { existsSync } from 'node:fs';

/** Loads a dotenv file if present. Missing file is a no-op; variables already in the environment win. */
export function loadEnv(path: string): boolean {
  if (!existsSync(path)) return false;
  process.loadEnvFile(path);
  return true;
}
