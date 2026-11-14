import { useQuery } from '@tanstack/react-query';
import type { LedgerSide } from '@finagent/contracts';
import { useOrgKey } from '@/features/admin/api';
import { api } from '@/lib/api';

export type DocumentRow = {
  id: string;
  side: LedgerSide;
  fileName: string;
  format: string;
  sizeBytes: number;
  sha256: string;
  status: 'UPLOADED' | 'IMPORTING' | 'IMPORTED' | 'FAILED';
  createdAt: string;
  bankAccount: {
    id: string;
    name: string;
    accountLast4: string;
    currency: 'COP' | 'USD';
    bank: { name: string };
  };
  period: { year: number; month: number };
  imports: ImportRow[];
};

export type ImportRow = {
  id: string;
  status: 'QUEUED' | 'PROCESSING' | 'COMPLETED' | 'FAILED';
  progress?: number;
  rowCount?: number;
  importedCount: number;
  errorCount: number;
  skippedCount?: number;
  duplicateCount: number;
  balanced: boolean | null;
  openingBalance?: string | null;
  closingBalance?: string | null;
  inflows?: string | null;
  outflows?: string | null;
  balanceDifference?: string | null;
  justification?: string | null;
  failureReason?: string | null;
  createdAt?: string;
  finishedAt?: string | null;
};

export type Template = {
  id: string;
  name: string;
  side: LedgerSide;
  format: string;
  software: string | null;
  currentVersion: number;
  headerSignature: string | null;
  status: 'ACTIVE' | 'INACTIVE';
  updatedAt: string;
  bank: { id: string; name: string } | null;
  versions: { version: number; config: unknown; createdAt: string }[];
};

export type Grid = {
  encoding: string | null;
  delimiter: string | null;
  sheets: { name: string; totalRows: number; rows: (string | number | null)[][] }[];
};

export type PreviewTx = {
  operationDate: string;
  descriptionOriginal: string;
  reference: string | null;
  documentNumber: string | null;
  thirdParty: string | null;
  amount: string;
  balance: string | null;
};

export type Preview = {
  rowCount: number;
  validCount: number;
  errorCount: number;
  skippedCount: number;
  duplicateCount: number;
  currency: string | null;
  balance: {
    opening: string | null;
    closing: string | null;
    inflows: string;
    outflows: string;
    balanced: boolean | null;
    difference: string | null;
    runningBalanceErrors: number[];
    reversed: boolean;
    from: string | null;
    to: string | null;
  };
  warnings: { code: string; message: string; blocking?: boolean }[];
  needsBalances: boolean;
  requiresJustification: boolean;
  canImport: boolean;
  errors: { row: number; messages: string[] }[];
  sample: {
    row: number;
    status: 'OK' | 'ERROR' | 'SKIPPED';
    errors: string[];
    tx: PreviewTx | null;
    duplicate: boolean;
  }[];
};

export const useDocuments = (filters: { side?: LedgerSide }) =>
  useQuery({
    queryKey: useOrgKey('documents', filters),
    queryFn: () => api<DocumentRow[]>('/api/documents', { query: filters }),
    refetchInterval: (q) => (q.state.data?.some((d) => d.status === 'IMPORTING') ? 2000 : false),
  });

export const useTemplates = (side?: LedgerSide) =>
  useQuery({
    queryKey: useOrgKey('templates', side),
    queryFn: () => api<Template[]>('/api/import-templates', { query: { side } }),
  });

export const STATUS_BADGE = {
  UPLOADED: 'PENDING',
  IMPORTING: 'PROCESSING',
  IMPORTED: 'IMPORTED',
  FAILED: 'IMPORT_ERROR',
} as const;

export const fileSize = (n: number) =>
  n < 1024 * 1024
    ? `${Math.ceil(n / 1024)} KB`
    : `${(n / 1024 / 1024).toFixed(1).replace('.', ',')} MB`;
