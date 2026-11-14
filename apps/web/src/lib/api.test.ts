import { expect, it } from 'vitest';
import { safeNext } from '@/auth/guards';
import { describeAgent } from '@/features/settings/SecurityPage';
import { mockApi } from '@/test-utils';
import { api, ApiError } from './api';

it('ante un 401 renueva la sesión una vez y reintenta la solicitud', async () => {
  let refreshed = false;
  const calls = mockApi({
    'GET /api/users': () =>
      refreshed ? { status: 200, body: { ok: true } } : { status: 401, body: {} },
    'GET /api/auth/csrf': () => ((document.cookie = 'fa_csrf=t'), { status: 200 }),
    'POST /api/auth/refresh': () => ((refreshed = true), { status: 200, body: { ok: true } }),
  });
  await expect(api('/api/users')).resolves.toEqual({ ok: true });
  expect(calls.filter((c) => c === 'POST /api/auth/refresh')).toHaveLength(1);
});

it('convierte errores del backend en ApiError con mensaje en español', async () => {
  mockApi({
    'GET /api/roles': () => ({
      status: 403,
      body: { code: 'FORBIDDEN', message: 'No tiene permiso para realizar esta acción.' },
    }),
  });
  const err = await api('/api/roles').catch((e) => e);
  expect(err).toBeInstanceOf(ApiError);
  expect(err).toMatchObject({
    status: 403,
    code: 'FORBIDDEN',
    message: 'No tiene permiso para realizar esta acción.',
  });
});

it('envía la organización activa en cada solicitud', async () => {
  localStorage.setItem('finagent:org', 'org-123');
  let header: string | undefined;
  mockApi({
    'GET /api/users': (init) => (
      (header = (init.headers as Record<string, string>)['x-organization-id']),
      { status: 200, body: {} }
    ),
  });
  await api('/api/users');
  expect(header).toBe('org-123');
});

it('?next= solo acepta rutas internas (sin redirección abierta)', () => {
  expect(safeNext('/administration/users')).toBe('/administration/users');
  expect(safeNext('//sitio-malicioso.com')).toBe('/dashboard');
  expect(safeNext('https://sitio-malicioso.com')).toBe('/dashboard');
  expect(safeNext(null)).toBe('/dashboard');
});

it('describe el dispositivo de una sesión', () => {
  expect(
    describeAgent(
      'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 Chrome/140.0 Safari/537.36',
    ),
  ).toBe('Chrome en macOS');
  expect(describeAgent(null)).toBe('Dispositivo desconocido');
});
