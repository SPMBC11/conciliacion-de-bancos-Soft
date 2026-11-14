import { createBrowserRouter, Navigate, type RouteObject } from 'react-router';
import { NotFoundPage } from '@/features/errors/NotFoundPage';
import { AppLayout } from '@/layouts/AppLayout';

/**
 * Cada fase registra aquí sus páginas y sube `phase` en navigation.ts para mostrarlas en el menú.
 * Las páginas se cargan bajo demanda (`lazy`): cada una es un archivo JS aparte.
 */
export const routes: RouteObject[] = [
  {
    element: <AppLayout />,
    children: [
      { index: true, element: <Navigate to="/dashboard" replace /> },
      {
        path: 'dashboard',
        lazy: async () => ({
          Component: (await import('@/features/dashboard/DashboardPage')).DashboardPage,
        }),
      },
      // Solo desarrollo: en producción este bloque y la galería desaparecen del bundle.
      ...(import.meta.env.DEV
        ? [
            {
              path: 'design-system',
              lazy: async () => ({
                Component: (await import('@/features/design-system/DesignSystemPage'))
                  .DesignSystemPage,
              }),
            },
          ]
        : []),
      { path: '*', element: <NotFoundPage /> },
    ],
  },
];

export const router = createBrowserRouter(routes);
