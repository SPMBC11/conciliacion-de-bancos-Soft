import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  plugins: [react(), tailwindcss()],
  // En desarrollo, /api se redirige al backend: mismo origen, sin problemas de cookies ni CORS.
  server: { port: 5173, proxy: { '/api': 'http://localhost:3000' } },
  test: { environment: 'jsdom', setupFiles: ['./src/test-setup.ts'] },
});
