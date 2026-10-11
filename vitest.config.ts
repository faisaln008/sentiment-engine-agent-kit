import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: { include: ['apps/backend/test/**/*.test.ts', 'packages/*/test/**/*.test.ts'] },
});
