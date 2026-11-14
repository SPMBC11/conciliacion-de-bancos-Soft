import { screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import { NAVIGATION, visibleNavigation } from '@/app/navigation';
import { renderRoute } from '@/test-utils';

describe('navegación', () => {
  it('las rutas son únicas y absolutas', () => {
    const paths = NAVIGATION.flatMap((g) => g.items.map((i) => i.path));
    expect(new Set(paths).size).toBe(paths.length);
    expect(paths.every((p) => p.startsWith('/'))).toBe(true);
  });

  it('el menú solo muestra pantallas ya implementadas (sin enlaces vacíos)', () => {
    expect(visibleNavigation(2).flatMap((g) => g.items.map((i) => i.path))).toEqual(['/dashboard']);
    expect(visibleNavigation(5).some((g) => g.label === 'Documentos')).toBe(true);
  });

  it('/ redirige al panel y el menú marca la página actual', async () => {
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
    renderRoute('/no-existe');
    expect(await screen.findByText('Página no disponible')).toBeInTheDocument();
  });

  it('el menú lateral se contrae y recuerda la preferencia', async () => {
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

describe('panel financiero', () => {
  it('sin datos muestra “Sin datos”, nunca números inventados', async () => {
    renderRoute('/dashboard');
    const indicators = await screen.findByRole('region', { name: 'Indicadores' });
    expect(within(indicators).getAllByText('Sin datos')).toHaveLength(7);
    expect(indicators.textContent).not.toMatch(/\d+\s*%/);
    expect(screen.getByText('Todavía no hay conciliaciones')).toBeInTheDocument();
  });
});
