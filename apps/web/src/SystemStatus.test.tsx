import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import { SystemStatus } from './SystemStatus';

afterEach(() => vi.unstubAllGlobals());

function renderWithQuery() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    <QueryClientProvider client={client}>
      <SystemStatus />
    </QueryClientProvider>,
  );
}

it('muestra cada servicio con texto, no solo color', async () => {
  vi.stubGlobal('fetch', async () =>
    Response.json({
      status: 'down',
      version: '0.1.0',
      checks: { database: 'up', redis: 'down', storage: 'up' },
    }),
  );
  renderWithQuery();
  expect(await screen.findByText('Versión 0.1.0')).toBeInTheDocument();
  expect(screen.getAllByText('✓ Operativo')).toHaveLength(2);
  expect(screen.getByText('✕ Caído')).toBeInTheDocument();
});

it('informa en español si la API no responde', async () => {
  vi.stubGlobal('fetch', async () => {
    throw new Error('red');
  });
  renderWithQuery();
  expect(await screen.findByText('✕ No se pudo contactar la API.')).toBeInTheDocument();
});
