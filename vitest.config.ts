import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  resolve: {
    alias: {
      '@app/contracts': fileURLToPath(
        new URL('./packages/contracts/src/index.ts', import.meta.url),
      ),
    },
  },
  test: { include: ['apps/backend/test/**/*.test.ts', 'apps/frontend/test/**/*.test.ts', 'packages/*/test/**/*.test.ts'] },
});
