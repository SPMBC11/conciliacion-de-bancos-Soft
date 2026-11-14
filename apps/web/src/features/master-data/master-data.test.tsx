import { screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import { meAs, mockApi, renderRoute } from '@/test-utils';

const me = (role: Parameters<typeof meAs>[0]) => ({
  'GET /api/auth/me': () => ({ status: 200, body: meAs(role) }),
});

const account = {
  id: 'a1',
  name: 'Corriente principal',
  maskedNumber: '****7890',
  type: 'CORRIENTE',
  currency: 'COP',
  openingBalance: '-15250.75',
  openingBalanceDate: '2026-09-30',
  openedAt: null,
  status: 'ACTIVE',
  bank: { id: 'b1', name: 'Bancolombia' },
  glAccount: { id: 'g1', code: '111005', name: 'Moneda nacional' },
};

describe('datos maestros (web)', () => {
  it('sin PUC, cuentas bancarias guía al plan de cuentas', async () => {
    mockApi({
      ...me('OWNER'),
      'GET /api/bank-accounts': () => ({ status: 200, body: [] }),
      'GET /api/chart-of-accounts': () => ({ status: 200, body: [] }),
    });
    renderRoute('/administration/bank-accounts');
    expect(await screen.findByText('Primero configure el plan de cuentas')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Nueva cuenta/ })).toBeDisabled();
  });

  it('lista cuentas enmascaradas con saldo en formato COP; Consulta no ve el botón de número completo', async () => {
    mockApi({
      ...me('VIEWER'),
      'GET /api/bank-accounts': () => ({ status: 200, body: [account] }),
      'GET /api/chart-of-accounts': () => ({
        status: 200,
        body: [
          {
            id: 'g1',
            code: '111005',
            name: 'Moneda nacional',
            nature: 'DEBITO',
            level: 4,
            acceptsMovement: true,
            status: 'ACTIVE',
          },
        ],
      }),
    });
    renderRoute('/administration/bank-accounts');
    expect(await screen.findByText('****7890')).toBeInTheDocument();
    expect(screen.getByText('−$ 15.250,75')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Ver número completo/ })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Nueva cuenta/ })).not.toBeInTheDocument();
  });

  it('el Propietario ve el número completo tras pedirlo explícitamente', async () => {
    const calls = mockApi({
      ...me('OWNER'),
      'GET /api/bank-accounts': () => ({ status: 200, body: [account] }),
      'GET /api/chart-of-accounts': () => ({
        status: 200,
        body: [
          {
            id: 'g1',
            code: '111005',
            name: 'x',
            nature: 'DEBITO',
            level: 4,
            acceptsMovement: true,
            status: 'ACTIVE',
          },
        ],
      }),
      'GET /api/auth/csrf': () => ((document.cookie = 'fa_csrf=t'), { status: 200 }),
      'POST /api/bank-accounts/a1/reveal-number': () => ({
        status: 200,
        body: { accountNumber: '1234567890' },
      }),
    });
    renderRoute('/administration/bank-accounts');
    await userEvent.click(
      await screen.findByRole('button', { name: /Ver número completo de Corriente principal/ }),
    );
    expect(await screen.findByText('1234567890')).toBeInTheDocument();
    expect(calls).toContain('POST /api/bank-accounts/a1/reveal-number');
  });

  it('PUC vacío: ofrece importar o cargar el PUC base', async () => {
    mockApi({ ...me('OWNER'), 'GET /api/chart-of-accounts': () => ({ status: 200, body: [] }) });
    renderRoute('/administration/chart-of-accounts');
    expect(await screen.findByText('Aún no hay plan de cuentas')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Cargar PUC base' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Importar Excel\/CSV/ })).toBeInTheDocument();
  });

  it('festivos: nacionales con día de la semana y sin botón de borrar', async () => {
    mockApi({
      ...me('ACCOUNTANT'),
      'GET /api/holidays': () => ({
        status: 200,
        body: [
          { id: null, date: '2026-11-16', name: 'Independencia de Cartagena', source: 'NACIONAL' },
        ],
      }),
    });
    renderRoute('/administration/holidays');
    const row = (await screen.findByText('Independencia de Cartagena')).closest('tr')!;
    expect(within(row).getByText('16/11/2026')).toBeInTheDocument();
    expect(within(row).getByText('lunes')).toBeInTheDocument();
    expect(within(row).queryByRole('button')).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Agregar festivo/ })).not.toBeInTheDocument(); // Contador sin master_data.manage
  });
});
