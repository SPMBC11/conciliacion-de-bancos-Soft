import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render } from '@testing-library/react';
import type { MeResponse, PermissionKey } from '@finagent/contracts';
import { SYSTEM_ROLES, type SystemRoleKey } from '@finagent/contracts';
import type { ReactNode } from 'react';
import { createMemoryRouter, RouterProvider } from 'react-router';
import { vi } from 'vitest';
import { PeriodProvider } from '@/app/period';
import { routes } from '@/app/router';
import { AuthProvider } from '@/auth/auth-provider';
import { TooltipProvider } from '@/components/ui/tooltip';
import { ThemeProvider } from '@/theme/theme-provider';

export function Providers({ children }: { children: ReactNode }) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return (
    <ThemeProvider>
      <QueryClientProvider client={client}>
        <AuthProvider>
          <PeriodProvider>
            <TooltipProvider>{children}</TooltipProvider>
          </PeriodProvider>
        </AuthProvider>
      </QueryClientProvider>
    </ThemeProvider>
  );
}

export function meAs(role: SystemRoleKey): MeResponse {
  return {
    user: {
      id: '00000000-0000-4000-8000-000000000001',
      email: 'ana@demo.co',
      fullName: 'Ana Pérez',
    },
    memberships: [
      {
        organizationId: '00000000-0000-4000-8000-0000000000aa',
        organizationName: 'Empresa Demo S.A.S.',
        nit: '900000000-1',
        role: {
          id: '00000000-0000-4000-8000-0000000000bb',
          key: role,
          name: SYSTEM_ROLES[role].name,
        },
        permissions: [...SYSTEM_ROLES[role].permissions] as PermissionKey[],
      },
    ],
  };
}

type Handler = (init: RequestInit & { url: string }) => { status: number; body?: unknown };

/** Simula la API: { 'GET /api/auth/me': () => ({status: 200, body}) }. Lo no definido responde 404. */
export function mockApi(handlers: Record<string, Handler>) {
  const calls: string[] = [];
  vi.stubGlobal(
    'fetch',
    vi.fn(async (input: string, init: RequestInit = {}) => {
      const url = input.split('?')[0]!;
      const key = `${init.method ?? 'GET'} ${url}`;
      calls.push(key);
      const handler = handlers[key];
      const { status, body } = handler
        ? handler({ ...init, url: input })
        : { status: 404, body: { code: 'NOT_FOUND', message: 'No existe.' } };
      return status === 204
        ? new Response(null, { status })
        : Response.json(body ?? {}, { status });
    }),
  );
  return calls;
}

export function renderRoute(path: string) {
  const router = createMemoryRouter(routes, { initialEntries: [path] });
  const view = render(
    <Providers>
      <RouterProvider router={router} />
    </Providers>,
  );
  return { ...view, router };
}
