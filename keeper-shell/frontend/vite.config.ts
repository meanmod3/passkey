import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'node:path';

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      '@keeper-shell/shared': path.resolve(__dirname, '../shared/types.ts'),
    },
  },
  server: {
    port: 5173,
    host: '0.0.0.0',
    proxy: {
      // BACKEND_URL is the internal proxy target (server-side: Docker DNS or localhost).
      // The browser talks to Vite only — all /api/* calls come through this proxy.
      '/api': {
        target: process.env.BACKEND_URL ?? 'http://localhost:4000',
        changeOrigin: true,
      },
    },
  },
});
