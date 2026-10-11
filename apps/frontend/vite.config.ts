import { fileURLToPath } from 'node:url';
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

const target = process.env['VITE_API_TARGET'] ?? 'http://localhost:3000';

// Alias to contracts *source* so a fresh clone builds without `npm run build` on contracts first.
export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      '@app/contracts': fileURLToPath(
        new URL('../../packages/contracts/src/index.ts', import.meta.url),
      ),
    },
  },
  server: {
    port: 5173,
    strictPort: true,
    proxy: {
      '/api': { target, changeOrigin: true },
      '/health': { target, changeOrigin: true },
      '/ws': { target, ws: true, changeOrigin: true },
    },
  },
});
