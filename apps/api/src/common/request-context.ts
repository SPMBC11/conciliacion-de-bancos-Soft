import { AsyncLocalStorage } from 'node:async_hooks';
import { randomUUID } from 'node:crypto';
import type { NextFunction, Request, Response } from 'express';

export type RequestContext = {
  correlationId: string;
  source: 'UI' | 'API' | 'WORKER' | 'SYSTEM';
  ip?: string;
  userAgent?: string;
  userId?: string;
  organizationId?: string;
};

const storage = new AsyncLocalStorage<RequestContext>();

/** Contexto de la solicitud actual (o del trabajo del worker). Lo usa la auditoría. */
export function ctx(): RequestContext {
  return storage.getStore() ?? { correlationId: 'none', source: 'SYSTEM' };
}

export function runWithContext<T>(context: RequestContext, fn: () => T): T {
  return storage.run(context, fn);
}

/** Identificador de correlación: se respeta el del cliente o se genera uno. Lo comparten logs y auditoría. */
export function correlationIdOf(req: Request & { id?: unknown }): string {
  if (typeof req.id === 'string') return req.id;
  const header = req.headers['x-correlation-id'];
  const id = typeof header === 'string' && /^[\w-]{1,64}$/.test(header) ? header : randomUUID();
  (req as { id?: string }).id = id;
  return id;
}

export function requestContextMiddleware(req: Request, _res: Response, next: NextFunction) {
  runWithContext(
    {
      correlationId: correlationIdOf(req),
      // La web envía X-Client: web; cualquier otro cliente cuenta como API.
      source: req.headers['x-client'] === 'web' ? 'UI' : 'API',
      ip: req.ip,
      userAgent: req.headers['user-agent']?.slice(0, 300),
    },
    next,
  );
}
