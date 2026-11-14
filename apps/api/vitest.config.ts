import swc from 'unplugin-swc';
import { defineConfig } from 'vitest/config';

const TEST_DATABASE_URL = 'postgresql://finagent:finagent_dev@localhost:5432/finagent_test';

// SWC conserva los metadatos de decoradores que necesita la inyección de dependencias de NestJS.
export default defineConfig({
  plugins: [swc.vite({ module: { type: 'es6' } })],
  test: {
    include: ['test/**/*.test.ts'],
    globalSetup: ['test/global-setup.ts'],
    env: {
      NODE_ENV: 'test',
      LOG_LEVEL: 'silent',
      DATABASE_URL: TEST_DATABASE_URL,
      AUTH_RATE_LIMIT: '1000',
      // Base Redis separada: los trabajos de prueba nunca llegan a la cola de desarrollo.
      REDIS_URL: 'redis://localhost:6379/1',
    },
    testTimeout: 15000,
    fileParallelism: false,
  },
});
