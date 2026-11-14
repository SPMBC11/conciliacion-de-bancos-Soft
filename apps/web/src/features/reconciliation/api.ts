import { useQuery } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { useOrgKey } from '@/features/admin/api';

export type MatchingRun = {
  id: string;
  bankAccountId: string;
  periodId: string;
  status: 'COMPLETED' | 'FAILED';
  inputFingerprint: string;
  bankTransactionCount: number;
  bookTransactionCount: number;
  suggestionCount: number;
  ruleVersion: { version: number; dateToleranceBusinessDays: number; maxGroupSize: number };
  bankAccount: { name: string; accountLast4: string; currency: string; bank: { name: string } };
  period: { year: number; month: number };
  createdAt: string;
};

export type Suggestion = {
  id: string;
  rule: string;
  status: string;
  reviewStatus: 'OPEN' | 'CONFIRMED' | 'REJECTED' | 'REQUIRES_REVIEW' | 'REVERSED';
  score: number;
  bankTransactionIds: string[];
  accountingTransactionIds: string[];
  amountDifference: string;
  dateDifferenceDays: number;
  explanation: string;
  feeType: string | null;
  createdAt: string;
  bankTransactions: WorkbenchTransaction[];
  accountingTransactions: WorkbenchTransaction[];
};

export type WorkbenchTransaction = {
  id: string;
  side: 'BANK' | 'BOOK';
  operationDate: string;
  valueDate: string | null;
  description: string;
  normalizedDescription: string;
  reference: string | null;
  documentNumber: string | null;
  amount: string;
  currency: string;
  duplicateStatus: 'NONE' | 'POSSIBLE' | 'CONFIRMED' | 'DISMISSED';
  carryover?: boolean;
};

export type Paged<T> = { page: number; pageSize: number; total: number; data: T[] };

export type ConfirmedMatch = {
  id: string;
  status: 'CONFIRMED' | 'REVERSED';
  confirmedAt: string;
  reversalReason: string | null;
  suggestion: { explanation: string; status: string };
  items: {
    id: string;
    side: 'BANK' | 'BOOK';
    bankTransactionId: string | null;
    accountingTransactionId: string | null;
    isActive: boolean;
  }[];
};

export type RunBalanceSummary = {
  bank: {
    movementCount: number;
    movementNet: string;
    matchedMovementCount: number;
    matchedMovementNet: string;
    pendingMovementCount: number;
    pendingMovementNet: string;
  };
  book: {
    movementCount: number;
    movementNet: string;
    matchedMovementCount: number;
    matchedMovementNet: string;
    pendingMovementCount: number;
    pendingMovementNet: string;
  };
  movementDifference: string;
  matchedDifference: string;
  pendingDifference: string;
};

export const useMatchingRuns = (bankAccountId?: string, periodId?: string) =>
  useQuery({
    queryKey: useOrgKey('matching-runs', bankAccountId, periodId),
    queryFn: () =>
      api<MatchingRun[]>('/api/reconciliations/runs', { query: { bankAccountId, periodId } }),
  });

export const useSuggestions = (
  runId: string | undefined,
  page: number,
  status?: string,
  resultGroup?: 'DIFFERENCES' | 'UNMATCHED' | 'DUPLICATES',
) =>
  useQuery({
    queryKey: useOrgKey('matching-suggestions', runId, page, status, resultGroup),
    enabled: Boolean(runId),
    queryFn: () =>
      api<Paged<Suggestion>>(`/api/reconciliations/runs/${runId}/suggestions`, {
        query: { page, pageSize: 50, status, resultGroup },
      }),
  });

export const useWorkbenchTransactions = (
  runId: string | undefined,
  side: 'BANK' | 'BOOK',
  page: number,
  search?: string,
) =>
  useQuery({
    queryKey: useOrgKey('workbench-transactions', runId, side, page, search),
    enabled: Boolean(runId),
    queryFn: () =>
      api<Paged<WorkbenchTransaction>>(`/api/reconciliations/runs/${runId}/transactions`, {
        query: { side, page, pageSize: 100, search },
      }),
  });

export const useConfirmedMatches = (runId: string | undefined) =>
  useQuery({
    queryKey: useOrgKey('confirmed-matches', runId),
    enabled: Boolean(runId),
    queryFn: () => api<ConfirmedMatch[]>(`/api/reconciliations/runs/${runId}/matches`),
  });

export const useRunBalanceSummary = (runId: string | undefined) =>
  useQuery({
    queryKey: useOrgKey('matching-run-summary', runId),
    enabled: Boolean(runId),
    queryFn: () => api<RunBalanceSummary>(`/api/reconciliations/runs/${runId}/summary`),
    refetchInterval: 5000,
  });
