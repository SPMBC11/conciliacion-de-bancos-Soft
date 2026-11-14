import { useQuery } from '@tanstack/react-query';
import { useAuth } from '@/auth/auth-provider';
import { api } from '@/lib/api';

export type RoleRow = {
  id: string;
  key: string;
  name: string;
  description: string | null;
  isSystem: boolean;
  permissions: string[];
  memberCount: number;
};

export type MemberRow = {
  id: string;
  status: 'ACTIVE' | 'DISABLED';
  createdAt: string;
  user: { id: string; email: string; fullName: string; lastLoginAt: string | null };
  role: { id: string; key: string; name: string };
};

export type InvitationRow = {
  id: string;
  email: string;
  expiresAt: string;
  createdAt: string;
  role: { id: string; name: string };
};

/** Claves de consulta incluyen la organización: cambiar de organización nunca reutiliza datos de otra. */
export function useOrgKey(...parts: unknown[]) {
  const { membership } = useAuth();
  return [membership?.organizationId, ...parts];
}

export function useRoles() {
  return useQuery({ queryKey: useOrgKey('roles'), queryFn: () => api<RoleRow[]>('/api/roles') });
}

export function useMembers() {
  return useQuery({
    queryKey: useOrgKey('users'),
    queryFn: () => api<{ members: MemberRow[]; invitations: InvitationRow[] }>('/api/users'),
  });
}
