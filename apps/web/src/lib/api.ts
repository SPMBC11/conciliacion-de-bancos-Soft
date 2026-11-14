import { CSRF_COOKIE, CSRF_HEADER, ORG_HEADER } from '@finagent/contracts';
import { readPref } from '@/lib/storage';

/** Error de la API con el formato único del backend (mensaje en español). */
export class ApiError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string,
    readonly details?: unknown,
  ) {
    super(message);
  }
}

function readCookie(name: string) {
  return document.cookie
    .split('; ')
    .find((c) => c.startsWith(`${name}=`))
    ?.slice(name.length + 1);
}

let csrfPromise: Promise<void> | null = null;
async function ensureCsrf() {
  if (readCookie(CSRF_COOKIE)) return;
  csrfPromise ??= fetch('/api/auth/csrf', { credentials: 'same-origin' }).then(() => {
    csrfPromise = null;
  });
  await csrfPromise;
}

/** Una sola renovación a la vez por pestaña, aunque fallen varias solicitudes juntas. */
let refreshPromise: Promise<boolean> | null = null;
function refreshSession() {
  refreshPromise ??= send('/api/auth/refresh', { method: 'POST' })
    .then((r) => r.ok || r.status === 401) // 401 REFRESH_RACE: otra pestaña ya renovó (cookies compartidas)
    .finally(() => {
      refreshPromise = null;
    });
  return refreshPromise;
}

/** Se invoca cuando la sesión no se puede recuperar (lo registra el AuthProvider). */
let onSessionExpired = () => {};
export function setSessionExpiredHandler(fn: () => void) {
  onSessionExpired = fn;
}

type Options = {
  method?: string;
  body?: unknown;
  query?: Record<string, string | number | undefined>;
  headers?: Record<string, string>;
};

async function send(path: string, { method = 'GET', body, query, headers }: Options = {}) {
  if (method !== 'GET') await ensureCsrf();
  const qs = query
    ? '?' +
      new URLSearchParams(
        Object.entries(query).filter(([, v]) => v !== undefined && v !== '') as [string, string][],
      )
    : '';
  const orgId = readPref('org');
  const isForm = body instanceof FormData;
  return fetch(path + qs, {
    method,
    credentials: 'same-origin',
    headers: {
      'x-client': 'web',
      // FormData: el navegador fija el content-type multipart con su boundary.
      ...(body !== undefined && !isForm && { 'content-type': 'application/json' }),
      ...(method !== 'GET' && { [CSRF_HEADER]: readCookie(CSRF_COOKIE) ?? '' }),
      ...(orgId && { [ORG_HEADER]: orgId }),
      ...headers,
    },
    body: body === undefined ? undefined : isForm ? body : JSON.stringify(body),
  });
}

const NO_REFRESH = [
  '/api/auth/login',
  '/api/auth/refresh',
  '/api/auth/accept-invitation',
  '/api/auth/reset-password',
];

export async function api<T = unknown>(path: string, options: Options = {}): Promise<T> {
  let res = await send(path, options);
  if (res.status === 401 && !NO_REFRESH.includes(path)) {
    if (await refreshSession()) res = await send(path, options);
    if (res.status === 401 && path !== '/api/auth/me') onSessionExpired();
  }
  if (res.status === 204) return undefined as T;
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new ApiError(
      res.status,
      data.code ?? 'ERROR',
      data.message ?? 'Ocurrió un error inesperado.',
      data.details,
    );
  }
  return data as T;
}

export const errorMessage = (err: unknown) =>
  err instanceof ApiError ? err.message : 'No se pudo contactar el servidor. Revise su conexión.';
