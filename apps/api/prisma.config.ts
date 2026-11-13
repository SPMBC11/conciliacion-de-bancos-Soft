import { defineConfig } from 'prisma/config';

try {
  process.loadEnvFile('../../.env');
} catch {
  // En Docker/CI las variables llegan por el entorno.
}

export default defineConfig({
  schema: 'prisma/schema.prisma',
  migrations: { path: 'prisma/migrations' },
  // Opcional para `prisma generate` (build sin BD); migrate falla con un error claro si falta.
  ...(process.env.DATABASE_URL && { datasource: { url: process.env.DATABASE_URL } }),
});
