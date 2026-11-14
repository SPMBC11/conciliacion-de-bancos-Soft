import { z } from 'zod';

const Money = z.string().regex(/^-?\d+(?:\.\d{1,2})?$/, 'Importe inválido.');

export const MatchingRulesRequest = z.object({
  dateToleranceBusinessDays: z.number().int().min(0).max(30),
  amountTolerance: Money,
  amountToleranceBasisPoints: z.number().int().min(0).max(1000),
  maxGroupSize: z.number().int().min(2).max(8),
});
export type MatchingRulesRequest = z.infer<typeof MatchingRulesRequest>;

export const CreateMatchingRunRequest = z.object({
  bankAccountId: z.uuid(),
  periodId: z.uuid(),
});
export type CreateMatchingRunRequest = z.infer<typeof CreateMatchingRunRequest>;

export const ConfirmMatchRequest = z.object({
  reason: z.string().trim().min(3).max(500).optional(),
});
export type ConfirmMatchRequest = z.infer<typeof ConfirmMatchRequest>;

export const ReverseMatchRequest = z.object({
  reason: z.string().trim().min(3).max(500),
});
export type ReverseMatchRequest = z.infer<typeof ReverseMatchRequest>;

export const ManualMatchRequest = z.object({
  runId: z.uuid(),
  bankTransactionIds: z.array(z.uuid()).min(1).max(50),
  accountingTransactionIds: z.array(z.uuid()).min(1).max(50),
  reason: z.string().trim().min(3).max(500),
});
export type ManualMatchRequest = z.infer<typeof ManualMatchRequest>;

export const SuggestionDecisionRequest = z.object({
  reason: z.string().trim().min(3).max(500),
});
export type SuggestionDecisionRequest = z.infer<typeof SuggestionDecisionRequest>;

export const WorkbenchListQuery = z.object({
  side: z.enum(['BANK', 'BOOK']),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(200).default(100),
  search: z.string().trim().max(100).optional(),
});
export type WorkbenchListQuery = z.infer<typeof WorkbenchListQuery>;

export const SuggestionsListQuery = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(200).default(50),
  status: z.enum(['OPEN', 'CONFIRMED', 'REJECTED', 'REQUIRES_REVIEW', 'REVERSED']).optional(),
  resultGroup: z.enum(['DIFFERENCES', 'UNMATCHED', 'DUPLICATES']).optional(),
});
export type SuggestionsListQuery = z.infer<typeof SuggestionsListQuery>;

const AdjustmentLineInput = z.object({
  glAccountId: z.uuid(),
  debit: Money,
  credit: Money,
  costCenter: z.string().trim().max(80).optional(),
});

export const CreateAdjustmentRequest = z.object({
  reconciliationId: z.uuid(),
  entryDate: z.iso.date(),
  description: z.string().trim().min(3).max(500),
  currency: z.string().length(3).toUpperCase(),
  lines: z.array(AdjustmentLineInput).min(2).max(100),
});

export const WorkflowReasonRequest = z.object({ reason: z.string().trim().min(3).max(500) });
