import type { PermissionKey } from '@finagent/contracts';
import type { ComponentType } from 'react';
import { createBrowserRouter, Navigate, type RouteObject } from 'react-router';
import { AnonymousOnly, RequireAuth, RequirePermission } from '@/auth/guards';
import { NotFoundPage } from '@/features/errors/NotFoundPage';
import { AppLayout } from '@/layouts/AppLayout';

/** Página cargada bajo demanda, opcionalmente protegida por permiso (la UI oculta; el backend decide). */
function page(
  load: () => Promise<ComponentType>,
  permission?: PermissionKey,
): Pick<RouteObject, 'lazy'> {
  return {
    lazy: async () => {
      const Component = await load();
      return {
        Component: permission
          ? () => (
              <RequirePermission permission={permission}>
                <Component />
              </RequirePermission>
            )
          : Component,
      };
    },
  };
}

/** Cada fase registra aquí sus páginas y sube `phase` en navigation.ts para mostrarlas en el menú. */
export const routes: RouteObject[] = [
  {
    element: <AnonymousOnly />,
    children: [
      { path: 'login', ...page(async () => (await import('@/features/auth/LoginPage')).LoginPage) },
      {
        path: 'forgot-password',
        ...page(
          async () => (await import('@/features/auth/ForgotPasswordPage')).ForgotPasswordPage,
        ),
      },
      {
        path: 'reset-password',
        ...page(async () => (await import('@/features/auth/ResetPasswordPage')).ResetPasswordPage),
      },
    ],
  },
  // Accesible con o sin sesión (un usuario existente puede unirse a otra organización).
  {
    path: 'accept-invitation',
    ...page(
      async () => (await import('@/features/auth/AcceptInvitationPage')).AcceptInvitationPage,
    ),
  },
  {
    element: <RequireAuth />,
    children: [
      {
        element: <AppLayout />,
        children: [
          { index: true, element: <Navigate to="/dashboard" replace /> },
          {
            path: 'dashboard',
            ...page(async () => (await import('@/features/dashboard/DashboardPage')).DashboardPage),
          },
          {
            path: 'reconciliations',
            ...page(async () => {
              const { WorkbenchPage } = await import('@/features/reconciliation/WorkbenchPage');
              return () => <WorkbenchPage mode="SUMMARY" />;
            }, 'reconciliations.read'),
          },
          {
            path: 'reconciliations/history',
            ...page(
              async () =>
                (await import('@/features/reconciliation/ApprovalClosingPage')).ApprovalClosingPage,
              'reconciliations.read',
            ),
          },
          {
            path: 'reconciliations/new',
            ...page(
              async () =>
                (await import('@/features/reconciliation/NewReconciliationPage'))
                  .NewReconciliationPage,
              'reconciliations.prepare',
            ),
          },
          {
            path: 'reconciliations/center',
            ...page(
              async () => (await import('@/features/reconciliation/WorkbenchPage')).WorkbenchPage,
              'reconciliations.read',
            ),
          },
          {
            path: 'reconciliations/pending',
            ...page(async () => {
              const { WorkbenchPage } = await import('@/features/reconciliation/WorkbenchPage');
              return () => <WorkbenchPage mode="PENDING" />;
            }, 'reconciliations.read'),
          },
          {
            path: 'reconciliations/discrepancies',
            ...page(async () => {
              const { WorkbenchPage } = await import('@/features/reconciliation/WorkbenchPage');
              return () => <WorkbenchPage mode="DIFFERENCES" />;
            }, 'reconciliations.read'),
          },
          {
            path: 'reconciliations/unmatched',
            ...page(async () => {
              const { WorkbenchPage } = await import('@/features/reconciliation/WorkbenchPage');
              return () => <WorkbenchPage mode="UNMATCHED" />;
            }, 'reconciliations.read'),
          },
          {
            path: 'analysis/matches',
            ...page(async () => {
              const { WorkbenchPage } = await import('@/features/reconciliation/WorkbenchPage');
              return () => <WorkbenchPage mode="MATCHES" />;
            }, 'reconciliations.read'),
          },
          {
            path: 'analysis/duplicates',
            ...page(async () => {
              const { WorkbenchPage } = await import('@/features/reconciliation/WorkbenchPage');
              return () => <WorkbenchPage mode="DUPLICATES" />;
            }, 'reconciliations.read'),
          },
          {
            path: 'documents',
            ...page(
              async () => (await import('@/features/documents/DocumentsPage')).DocumentsPage,
              'reconciliations.read',
            ),
          },
          {
            path: 'documents/bank-statements',
            ...page(async () => {
              const { DocumentsPage } = await import('@/features/documents/DocumentsPage');
              return () => <DocumentsPage side="BANK" />;
            }, 'reconciliations.read'),
          },
          {
            path: 'documents/accounting',
            ...page(async () => {
              const { DocumentsPage } = await import('@/features/documents/DocumentsPage');
              return () => <DocumentsPage side="BOOK" />;
            }, 'reconciliations.read'),
          },
          {
            path: 'documents/imports',
            ...page(
              async () => (await import('@/features/documents/ImportsPage')).ImportsPage,
              'reconciliations.read',
            ),
          },
          {
            path: 'documents/templates',
            ...page(async () => (await import('@/features/documents/TemplatesPage')).TemplatesPage),
          },
          {
            path: 'documents/:id',
            ...page(
              async () =>
                (await import('@/features/documents/DocumentDetailPage')).DocumentDetailPage,
              'reconciliations.read',
            ),
          },
          {
            path: 'administration/users',
            ...page(
              async () => (await import('@/features/admin/UsersPage')).UsersPage,
              'users.read',
            ),
          },
          {
            path: 'administration/roles',
            ...page(
              async () => (await import('@/features/admin/RolesPage')).RolesPage,
              'users.read',
            ),
          },
          {
            path: 'administration/audit',
            ...page(
              async () => (await import('@/features/admin/AuditPage')).AuditPage,
              'audit.read',
            ),
          },
          {
            path: 'administration/bank-accounts',
            ...page(
              async () =>
                (await import('@/features/master-data/BankAccountsPage')).BankAccountsPage,
              'bank_accounts.read',
            ),
          },
          {
            path: 'administration/chart-of-accounts',
            ...page(
              async () =>
                (await import('@/features/master-data/ChartOfAccountsPage')).ChartOfAccountsPage,
            ),
          },
          {
            path: 'reports/reconciliation',
            ...page(
              async () => (await import('@/features/reconciliation/ReportsPage')).ReportsPage,
              'reconciliations.read',
            ),
          },
          {
            path: 'administration/periods',
            ...page(async () => (await import('@/features/master-data/PeriodsPage')).PeriodsPage),
          },
          {
            path: 'administration/rules',
            ...page(
              async () => (await import('@/features/reconciliation/RulesPage')).RulesPage,
              'rules.manage',
            ),
          },
          {
            path: 'administration/holidays',
            ...page(async () => (await import('@/features/master-data/HolidaysPage')).HolidaysPage),
          },
          {
            path: 'settings',
            ...page(
              async () => (await import('@/features/settings/PreferencesPage')).PreferencesPage,
            ),
          },
          {
            path: 'settings/security',
            ...page(async () => (await import('@/features/settings/SecurityPage')).SecurityPage),
          },
          // Solo desarrollo: en producción este bloque y la galería desaparecen del bundle.
          ...(import.meta.env.DEV
            ? [
                {
                  path: 'design-system',
                  ...page(
                    async () =>
                      (await import('@/features/design-system/DesignSystemPage')).DesignSystemPage,
                  ),
                },
              ]
            : []),
          { path: '*', element: <NotFoundPage /> },
        ],
      },
    ],
  },
];

export const router = createBrowserRouter(routes);
