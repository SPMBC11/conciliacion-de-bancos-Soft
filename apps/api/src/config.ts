import { z } from 'zod';

try {
  process.loadEnvFile('../../.env');
} catch {
  // Sin .env: las variables llegan por el entorno (Docker/CI).
}

const Env = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  APP_VERSION: z.string().default('0.1.0'),
  API_PORT: z.coerce.number().int().default(3000),
  WEB_ORIGIN: z.string().url(),
  LOG_LEVEL: z.enum(['silent', 'fatal', 'error', 'warn', 'info', 'debug', 'trace']).default('info'),
  DATABASE_URL: z.string().url(),
  REDIS_URL: z.string().url(),
  S3_ENDPOINT: z.string().url(),
  S3_REGION: z.string(),
  S3_BUCKET: z.string(),
  S3_ACCESS_KEY: z.string(),
  S3_SECRET_KEY: z.string(),
  SMTP_HOST: z.string(),
  SMTP_PORT: z.coerce.number().int(),
  MAIL_FROM: z.string().default('FinAgent AI <no-reply@finagent.local>'),
  JWT_SECRET: z.string().min(32, 'JWT_SECRET debe tener al menos 32 caracteres.'),
  COOKIE_SECURE: z.stringbool().default(false),
  AUTH_RATE_LIMIT: z.coerce.number().int().positive().default(10),
  ENCRYPTION_KEY: z
    .string()
    .refine(
      (v) => Buffer.from(v, 'base64').length === 32,
      'ENCRYPTION_KEY debe ser 32 bytes en base64.',
    ),
});

const parsed = Env.safeParse(process.env);
if (!parsed.success) {
  // Fallar al arrancar es preferible a fallar en mitad de una conciliación.
  console.error('Configuración inválida:', z.prettifyError(parsed.error));
  process.exit(1);
}

export const config = parsed.data;
export type Config = typeof config;
