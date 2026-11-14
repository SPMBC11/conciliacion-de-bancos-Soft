import { expect, test } from '@playwright/test';

test('login presenta controles accesibles en escritorio y móvil', async ({ page }) => {
  await page.route('**/api/auth/me', (route) =>
    route.fulfill({
      status: 401,
      contentType: 'application/json',
      body: JSON.stringify({ code: 'UNAUTHENTICATED', message: 'Inicie sesión.' }),
    }),
  );
  await page.goto('/login');
  await expect(page.getByRole('heading', { name: 'Iniciar sesión' })).toBeVisible();
  await expect(page.getByLabel('Correo electrónico')).toBeVisible();
  await expect(page.getByLabel('Contraseña')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Ingresar' })).toBeVisible();
});

test('informe muestra saldos y distingue un periodo preliminar', async ({ page }) => {
  const orgId = '11111111-1111-4111-8111-111111111111';
  const runId = '22222222-2222-4222-8222-222222222222';
  await page.route('**/api/auth/me', (route) =>
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        user: {
          id: '33333333-3333-4333-8333-333333333333',
          email: 'tester@example.com',
          fullName: 'QA Tester',
        },
        memberships: [
          {
            organizationId: orgId,
            organizationName: 'Empresa de prueba',
            nit: '900000001-1',
            role: { id: '44444444-4444-4444-8444-444444444444', key: 'OWNER', name: 'Propietario' },
            permissions: ['reconciliations.read'],
          },
        ],
      }),
    }),
  );
  await page.route('**/api/reconciliations/runs*', (route) =>
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify([
        {
          id: runId,
          bankAccountId: '55555555-5555-4555-8555-555555555555',
          periodId: '66666666-6666-4666-8666-666666666666',
          status: 'COMPLETED',
          inputFingerprint: 'a'.repeat(64),
          bankTransactionCount: 1,
          bookTransactionCount: 1,
          suggestionCount: 1,
          ruleVersion: { version: 1, dateToleranceBusinessDays: 3, maxGroupSize: 6 },
          bankAccount: {
            name: 'Cuenta operativa',
            accountLast4: '1234',
            currency: 'COP',
            bank: { name: 'Banco de prueba' },
          },
          period: { year: 2026, month: 10 },
          createdAt: '2026-11-01T12:00:00.000Z',
        },
      ]),
    }),
  );
  await page.route(`**/api/reconciliations/reports/${runId}`, (route) =>
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        generatedAt: '2026-11-13T12:00:00.000Z',
        run: {
          id: runId,
          bankAccount: {
            name: 'Cuenta operativa',
            accountLast4: '1234',
            currency: 'COP',
            bank: { name: 'Banco de prueba' },
          },
          period: { year: 2026, month: 10 },
        },
        summary: {
          bank: { movementCount: 1, movementNet: '-500.00', pendingMovementCount: 1 },
          book: { movementCount: 1, movementNet: '500.00', pendingMovementCount: 1 },
          movementDifference: '0.00',
        },
        suggestionStats: [{ status: 'EXACT', count: 1 }],
        bankTransactions: [
          {
            id: 'bank-1',
            operationDate: '2026-10-15',
            description: 'Pago de prueba',
            amount: '-500.00',
            currency: 'COP',
            matchStatus: 'PENDIENTE',
          },
        ],
        accountingTransactions: [
          {
            id: 'book-1',
            operationDate: '2026-10-15',
            description: 'Pago de prueba',
            amount: '500.00',
            currency: 'COP',
            matchStatus: 'PENDIENTE',
          },
        ],
        matches: [],
        adjustments: [],
        reconciliation: null,
      }),
    }),
  );
  await page.goto('/reports/reconciliation');
  await expect(page.getByRole('heading', { name: 'Informe de conciliación' })).toBeVisible();
  await expect(page.getByText('Cuenta operativa · •••• 1234')).toBeVisible();
  await expect(page.getByText('PRELIMINAR', { exact: true }).last()).toBeVisible();
  await expect(page.getByText('$ 0,00', { exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: /Excel/ })).toBeVisible();
});
