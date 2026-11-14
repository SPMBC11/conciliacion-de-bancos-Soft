import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import { NAVIGATION, visibleNavigation } from '@/app/navigation';
import { meAs, mockApi, renderRoute } from '@/test-utils';

const signedInAs = (role: Parameters<typeof meAs>[0]) =>
  mockApi({ 'GET /api/auth/me': () => ({ status: 200, body: meAs(role) }) });

describe('navegación', () => {
  it('las rutas son únicas y absolutas', () => {
    const paths = NAVIGATION.flatMap((g) => g.items.map((i) => i.path));
    expect(new Set(paths).size).toBe(paths.length);
    expect(paths.every((p) => p.startsWith('/'))).toBe(true);
  });

  it('el menú solo muestra pantallas ya implementadas y permitidas', () => {
    expect(visibleNavigation(2).flatMap((g) => g.items.map((i) => i.path))).toEqual(['/dashboard']);
    const viewer = visibleNavigation(3, (p) => p === 'reports.read').flatMap((g) =>
      g.items.map((i) => i.path),
    );
    expect(viewer).not.toContain('/administration/users');
    expect(visibleNavigation(3).flatMap((g) => g.items.map((i) => i.path))).toContain(
      '/administration/audit',
    );
  });

  it('/ redirige al panel y el menú marca la página actual', async () => {
    signedInAs('OWNER');
    renderRoute('/');
    expect(await screen.findByRole('heading', { level: 1 })).toHaveTextContent(
      /Buen(os|as) (días|tardes|noches)/,
    );
    const nav = screen.getByRole('navigation', { name: 'Navegación principal' });
    expect(within(nav).getByRole('link', { name: 'Panel financiero' })).toHaveAttribute(
      'aria-current',
      'page',
    );
  });

  it('una ruta desconocida muestra la página 404 en español', async () => {
    signedInAs('OWNER');
    renderRoute('/no-existe');
    expect(await screen.findByText('Página no disponible')).toBeInTheDocument();
  });

  it('el menú lateral se contrae y recuerda la preferencia', async () => {
    signedInAs('OWNER');
    const user = userEvent.setup();
    const { unmount } = renderRoute('/dashboard');
    await user.click(await screen.findByRole('button', { name: 'Contraer menú' }));
    expect(screen.getByRole('button', { name: 'Expandir menú' })).toHaveAttribute(
      'aria-expanded',
      'false',
    );
    unmount();
    renderRoute('/dashboard');
    expect(await screen.findByRole('button', { name: 'Expandir menú' })).toBeInTheDocument();
  });
});

describe('acceso', () => {
  it('sin sesión redirige al login conservando la página pedida', async () => {
    mockApi({
      'GET /api/auth/me': () => ({
        status: 401,
        body: { code: 'UNAUTHORIZED', message: 'Debe iniciar sesión.' },
      }),
    });
    const { router } = renderRoute('/administration/users');
    expect(await screen.findByRole('heading', { name: 'Iniciar sesión' })).toBeInTheDocument();
    expect(router.state.location.search).toBe('?next=%2Fadministration%2Fusers');
  });

  it('el menú de un Consulta no muestra administración; la URL directa muestra “Sin permiso”', async () => {
    signedInAs('VIEWER');
    renderRoute('/administration/audit');
    expect(await screen.findByText('Sin permiso')).toBeInTheDocument();
    const nav = screen.getByRole('navigation', { name: 'Navegación principal' });
    expect(within(nav).queryByRole('link', { name: 'Usuarios' })).not.toBeInTheDocument();
    expect(within(nav).queryByRole('link', { name: 'Auditoría' })).not.toBeInTheDocument();
  });

  it('el Propietario ve la administración en el menú', async () => {
    signedInAs('OWNER');
    renderRoute('/dashboard');
    const nav = await screen.findByRole('navigation', { name: 'Navegación principal' });
    for (const name of ['Usuarios', 'Roles y permisos', 'Auditoría', 'Preferencias', 'Seguridad']) {
      expect(within(nav).getByRole('link', { name })).toBeInTheDocument();
    }
  });
});

describe('panel financiero', () => {
  it('sin datos muestra “Sin datos”, nunca números inventados', async () => {
    signedInAs('OWNER');
    renderRoute('/dashboard');
    const indicators = await screen.findByRole('region', { name: 'Indicadores' });
    expect(within(indicators).getAllByText('Sin datos')).toHaveLength(7);
    expect(indicators.textContent).not.toMatch(/\d+\s*%/);
    expect(screen.getByText('Todavía no hay conciliaciones')).toBeInTheDocument();
  });
});

describe('login', () => {
  it('valida en español, inicia sesión y vuelve a la página pedida', async () => {
    let me: unknown = null;
    const calls = mockApi({
      'GET /api/auth/me': () =>
        me ? { status: 200, body: me } : { status: 401, body: { code: 'UNAUTHORIZED' } },
      'GET /api/auth/csrf': () => {
        document.cookie = 'fa_csrf=test-csrf-token';
        return { status: 200, body: {} };
      },
      'POST /api/auth/login': (init) => {
        expect((init.headers as Record<string, string>)['x-csrf-token']).toBe('test-csrf-token');
        me = meAs('ACCOUNTANT');
        return { status: 200, body: me };
      },
    });
    const user = userEvent.setup();
    const { router } = renderRoute('/login?next=/settings');
    await user.click(await screen.findByRole('button', { name: 'Ingresar' }));
    expect(await screen.findByText('Correo electrónico inválido.')).toBeInTheDocument();

    await user.type(screen.getByLabelText('Correo electrónico'), 'ana@demo.co');
    await user.type(screen.getByLabelText('Contraseña'), 'una-clave-cualquiera');
    await user.click(screen.getByRole('button', { name: 'Ingresar' }));
    await waitFor(() => expect(router.state.location.pathname).toBe('/settings'));
    expect(calls).toContain('POST /api/auth/login');
  });

  it('muestra el mensaje del servidor si las credenciales fallan', async () => {
    document.cookie = 'fa_csrf=x';
    mockApi({
      'GET /api/auth/me': () => ({ status: 401, body: {} }),
      'POST /api/auth/login': () => ({
        status: 401,
        body: { code: 'UNAUTHORIZED', message: 'Correo o contraseña incorrectos.' },
      }),
    });
    const user = userEvent.setup();
    renderRoute('/login');
    await user.type(await screen.findByLabelText('Correo electrónico'), 'ana@demo.co');
    await user.type(screen.getByLabelText('Contraseña'), 'mala');
    await user.click(screen.getByRole('button', { name: 'Ingresar' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('Correo o contraseña incorrectos.');
  });
});
