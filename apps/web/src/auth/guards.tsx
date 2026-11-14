import type { PermissionKey } from '@finagent/contracts';
import { ShieldOff } from 'lucide-react';
import type { ReactNode } from 'react';
import { Navigate, Outlet, useLocation, useSearchParams } from 'react-router';
import { EmptyState, LoadingState } from '@/components/States';
import { NoOrganizationPage } from '@/features/auth/NoOrganizationPage';
import { useAuth } from './auth-provider';

/** Rutas privadas: sin sesión → /login (y vuelve a la página original tras entrar). */
export function RequireAuth() {
  const { status, membership } = useAuth();
  const location = useLocation();
  if (status === 'loading') return <LoadingState rows={4} label="Verificando sesión…" />;
  if (status === 'anonymous') {
    return (
      <Navigate
        to={`/login?next=${encodeURIComponent(location.pathname + location.search)}`}
        replace
      />
    );
  }
  if (!membership) return <NoOrganizationPage />;
  return <Outlet />;
}

/** Oculta la pantalla si falta el permiso. El backend vuelve a verificarlo siempre. */
export function RequirePermission({
  permission,
  children,
}: {
  permission: PermissionKey;
  children: ReactNode;
}) {
  const { can } = useAuth();
  if (!can(permission)) {
    return (
      <EmptyState
        icon={ShieldOff}
        title="Sin permiso"
        description="Su rol en esta organización no permite ver esta sección. Pida acceso a un administrador."
        className="py-24"
      />
    );
  }
  return children;
}

/** Solo rutas internas en ?next= (evita redirecciones abiertas a otros sitios). */
export function safeNext(next: string | null) {
  return next && next.startsWith('/') && !next.startsWith('//') ? next : '/dashboard';
}

/** Páginas públicas (login, recuperación): con sesión, ir a ?next= o al panel. */
export function AnonymousOnly() {
  const { status } = useAuth();
  const [params] = useSearchParams();
  if (status === 'loading') return <LoadingState rows={2} />;
  if (status === 'authenticated') return <Navigate to={safeNext(params.get('next'))} replace />;
  return <Outlet />;
}
