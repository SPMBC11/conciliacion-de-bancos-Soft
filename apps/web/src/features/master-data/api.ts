import { useQuery } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { useOrgKey } from '@/features/admin/api';

export type Bank = { id: string; name: string; organizationId: string | null };
export type GlAccount = {
  id: string;
  code: string;
  name: string;
  nature: 'DEBITO' | 'CREDITO';
  level: number;
  acceptsMovement: boolean;
  status: 'ACTIVE' | 'INACTIVE';
};
export type BankAccount = {
  id: string;
  name: string;
  maskedNumber: string;
  type: 'CORRIENTE' | 'AHORROS';
  currency: 'COP' | 'USD';
  openingBalance: string;
  openingBalanceDate: string;
  openedAt: string | null;
  status: 'ACTIVE' | 'INACTIVE';
  bank: { id: string; name: string };
  glAccount: { id: string; code: string; name: string };
};

export const useBanks = () =>
  useQuery({ queryKey: useOrgKey('banks'), queryFn: () => api<Bank[]>('/api/banks') });

export const useBankAccounts = () =>
  useQuery({
    queryKey: useOrgKey('bank-accounts'),
    queryFn: () => api<BankAccount[]>('/api/bank-accounts'),
  });

export const useGlAccounts = () =>
  useQuery({
    queryKey: useOrgKey('chart-of-accounts'),
    queryFn: () => api<GlAccount[]>('/api/chart-of-accounts'),
  });

export const glLabel = (g: { code: string; name: string }) => `${g.code} · ${g.name}`;
