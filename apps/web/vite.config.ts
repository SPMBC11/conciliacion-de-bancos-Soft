import { fileURLToPath } from 'node:url';
import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  plugins: [react(), tailwindcss()],
  resolve: { alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) } },
  // En desarrollo, /api se redirige al backend: mismo origen, sin problemas de cookies ni CORS.
  server: { port: 5173, proxy: { '/api': 'http://localhost:3000' } },
  // Núcleo (React, router, Radix, TanStack Query) ≈ 175 kB gzip; las páginas van en archivos aparte.
  build: { chunkSizeWarningLimit: 650 },
  test: { environment: 'jsdom', setupFiles: ['./src/test-setup.ts'] },
});
