import { z } from 'zod';

export const ServiceStatus = z.enum(['up', 'down']);

export const HealthResponse = z.object({
  status: ServiceStatus,
  version: z.string(),
  checks: z.object({ database: ServiceStatus, redis: ServiceStatus, storage: ServiceStatus }),
});
export type HealthResponse = z.infer<typeof HealthResponse>;

/** Formato único de error de la API (mensaje siempre en español). */
export const ApiError = z.object({
  code: z.string(),
  message: z.string(),
  details: z.unknown().optional(),
  correlationId: z.string(),
});
export type ApiError = z.infer<typeof ApiError>;

export * from './auth.js';
