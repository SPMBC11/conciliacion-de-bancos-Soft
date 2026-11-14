import type { CookieOptions, Response } from 'express';
import { CSRF_COOKIE } from '@finagent/contracts';
import { config } from '../../config.js';
import { ACCESS_TTL_SECONDS, randomToken, REFRESH_TTL_MS } from './tokens.js';

export const ACCESS_COOKIE = 'fa_at';
export const REFRESH_COOKIE = 'fa_rt';

const base: CookieOptions = { httpOnly: true, secure: config.COOKIE_SECURE, sameSite: 'strict' };
// El refresh solo viaja a /api/auth: no se expone en el resto de solicitudes.
const refreshOpts: CookieOptions = { ...base, path: '/api/auth' };
const accessOpts: CookieOptions = { ...base, path: '/api' };

export function setSessionCookies(res: Response, accessToken: string, refreshToken: string) {
  res.cookie(ACCESS_COOKIE, accessToken, { ...accessOpts, maxAge: ACCESS_TTL_SECONDS * 1000 });
  res.cookie(REFRESH_COOKIE, refreshToken, { ...refreshOpts, maxAge: REFRESH_TTL_MS });
}

export function clearSessionCookies(res: Response) {
  res.clearCookie(ACCESS_COOKIE, accessOpts);
  res.clearCookie(REFRESH_COOKIE, refreshOpts);
}

/** Cookie CSRF legible por la web (doble envío). No es secreta: protege porque otro sitio no puede leerla. */
export function ensureCsrfCookie(res: Response, current?: string): string {
  if (current && /^[\w-]{43}$/.test(current)) return current;
  const token = randomToken();
  res.cookie(CSRF_COOKIE, token, {
    httpOnly: false,
    secure: config.COOKIE_SECURE,
    sameSite: 'strict',
    path: '/',
  });
  return token;
}
