import { useQuery, useQueryClient } from '@tanstack/react-query';
import { type Membership, type MeResponse, type PermissionKey } from '@finagent/contracts';
import {
  createContext,
  type ReactNode,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from 'react';
import { api, ApiError, setSessionExpiredHandler } from '@/lib/api';
import { readPref, writePref } from '@/lib/storage';

type AuthContextValue = {
  status: 'loading' | 'anonymous' | 'authenticated';
  me: MeResponse | null;
  /** Organización activa (la cabecera X-Organization-Id de cada solicitud). */
  membership: Membership | null;
  selectOrganization: (organizationId: string) => void;
  can: (permission: PermissionKey) => boolean;
  /** Tras login / aceptar invitación: guarda la respuesta /me sin otra solicitud. */
  signedIn: (me: MeResponse) => void;
  logout: () => Promise<void>;
};

const AuthContext = createContext<AuthContextValue | null>(null);
const ME_KEY = ['auth', 'me'];

async function fetchMe(): Promise<MeResponse | null> {
  try {
    return await api<MeResponse>('/api/auth/me');
  } catch (err) {
    if (err instanceof ApiError && err.status === 401) return null;
    throw err;
  }
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const queryClient = useQueryClient();
  const { data: me, isPending } = useQuery({
    queryKey: ME_KEY,
    queryFn: fetchMe,
    staleTime: 60_000,
    retry: false,
  });
  const [selectedOrg, setSelectedOrg] = useState(() => readPref('org'));

  /**
   * Borra los datos de negocio en caché pero conserva la consulta de sesión (que los componentes observan):
   * queryClient.clear() la eliminaría y el nuevo valor no llegaría a los observadores.
   */
  const resetSession = useCallback(
    (me: MeResponse | null) => {
      queryClient.removeQueries({ predicate: (q) => q.queryKey[0] !== 'auth' });
      queryClient.removeQueries({ queryKey: ['auth', 'sessions'] });
      queryClient.setQueryData(ME_KEY, me);
    },
    [queryClient],
  );
  const clearSession = useCallback(() => resetSession(null), [resetSession]);

  useEffect(() => setSessionExpiredHandler(clearSession), [clearSession]);

  const membership = useMemo(() => {
    if (!me?.memberships.length) return null;
    return me.memberships.find((m) => m.organizationId === selectedOrg) ?? me.memberships[0]!;
  }, [me, selectedOrg]);

  // Mantener la preferencia alineada con una membresía válida.
  useEffect(() => {
    if (membership) writePref('org', membership.organizationId);
  }, [membership]);

  const value: AuthContextValue = {
    status: isPending ? 'loading' : me ? 'authenticated' : 'anonymous',
    me: me ?? null,
    membership,
    selectOrganization: (organizationId) => {
      writePref('org', organizationId);
      setSelectedOrg(organizationId);
      // Los datos de la organización anterior no deben mostrarse en la nueva.
      queryClient.removeQueries({ predicate: (q) => q.queryKey[0] !== 'auth' });
    },
    can: (permission) => !!membership?.permissions.includes(permission),
    signedIn: (data) => resetSession(data),
    logout: async () => {
      try {
        await api('/api/auth/logout', { method: 'POST' });
      } finally {
        clearSession();
      }
    },
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth debe usarse dentro de AuthProvider');
  return ctx;
}
