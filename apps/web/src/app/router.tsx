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
            path: 'administration/periods',
            ...page(async () => (await import('@/features/master-data/PeriodsPage')).PeriodsPage),
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
