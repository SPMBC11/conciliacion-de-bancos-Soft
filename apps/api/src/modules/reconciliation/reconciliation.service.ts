import { createHash } from 'node:crypto';
import { Injectable } from '@nestjs/common';
import {
  parseAmount,
  suggestMatches,
  toAmountString,
  type MatchTransaction,
} from '@finagent/domain';
import type { Prisma } from '../../generated/prisma/client.js';
import { Errors } from '../../common/errors.js';
import { PrismaService } from '../../infrastructure/prisma.service.js';
import { AuditService } from '../audit/audit.service.js';
import type { ActiveMembership, AuthUser } from '../auth/decorators.js';
import { accessibleAccounts, assertAccountAccess } from '../master-data/account-access.js';

const DEFAULT_RULES = {
  dateToleranceBusinessDays: 3,
  amountTolerance: '1000.00',
  amountToleranceBasisPoints: 10,
  maxGroupSize: 6,
};

type RulesInput = typeof DEFAULT_RULES;
type RunWithRule = Prisma.MatchingRunGetPayload<{
  include: {
    ruleVersion: true;
    bankAccount: {
      select: { name: true; accountLast4: true; currency: true; bank: { select: { name: true } } };
    };
    period: { select: { year: true; month: true } };
  };
}>;

const runPresentation = {
  ruleVersion: true,
  bankAccount: {
    select: { name: true, accountLast4: true, currency: true, bank: { select: { name: true } } },
  },
  period: { select: { year: true, month: true } },
} as const;

@Injectable()
export class ReconciliationService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  private async currentRule(organizationId: string) {
    let rule = await this.prisma.matchingRuleVersion.findFirst({
      where: { organizationId },
      orderBy: { version: 'desc' },
    });
    if (!rule) {
      rule = await this.prisma.matchingRuleVersion.create({
        data: {
          organizationId,
          version: 1,
          dateToleranceBusinessDays: DEFAULT_RULES.dateToleranceBusinessDays,
          amountTolerance: DEFAULT_RULES.amountTolerance,
          amountToleranceBasisPoints: DEFAULT_RULES.amountToleranceBasisPoints,
          maxGroupSize: DEFAULT_RULES.maxGroupSize,
        },
      });
    }
    return rule;
  }

  async getRules(organizationId: string) {
    const rule = await this.currentRule(organizationId);
    return this.presentRule(rule);
  }

  async updateRules(membership: ActiveMembership, user: AuthUser, input: RulesInput) {
    const previous = await this.currentRule(membership.organizationId);
    const next = await this.prisma.matchingRuleVersion.create({
      data: {
        organizationId: membership.organizationId,
        version: previous.version + 1,
        dateToleranceBusinessDays: input.dateToleranceBusinessDays,
        amountTolerance: input.amountTolerance,
        amountToleranceBasisPoints: input.amountToleranceBasisPoints,
        maxGroupSize: input.maxGroupSize,
        createdBy: user.id,
      },
    });
    await this.audit.record({
      action: 'MATCHING_RULE_VERSION_CREATED',
      entity: 'matching_rule_version',
      entityId: next.id,
      before: this.presentRule(previous),
      after: this.presentRule(next),
    });
    return this.presentRule(next);
  }

  private presentRule(rule: {
    id: string;
    version: number;
    dateToleranceBusinessDays: number;
    amountTolerance: { toFixed(n: number): string };
    amountToleranceBasisPoints: number;
    maxGroupSize: number;
    createdAt: Date;
  }) {
    return {
      id: rule.id,
      version: rule.version,
      dateToleranceBusinessDays: rule.dateToleranceBusinessDays,
      amountTolerance: rule.amountTolerance.toFixed(2),
      amountToleranceBasisPoints: rule.amountToleranceBasisPoints,
      maxGroupSize: rule.maxGroupSize,
      createdAt: rule.createdAt,
    };
  }

  async createRun(
    membership: ActiveMembership,
    user: AuthUser,
    bankAccountId: string,
    periodId: string,
    idempotencyKey: string,
  ) {
    assertAccountAccess(membership, bankAccountId);
    const existing = await this.prisma.matchingRun.findFirst({
      where: { organizationId: membership.organizationId, idempotencyKey },
      include: runPresentation,
    });
    if (existing) {
      if (existing.bankAccountId !== bankAccountId || existing.periodId !== periodId)
        throw Errors.conflict(
          'IDEMPOTENCY_KEY_REUSED',
          'La clave de idempotencia ya se usó con otra cuenta o periodo.',
        );
      return this.presentRun(existing);
    }

    const [account, period, rule] = await Promise.all([
      this.prisma.bankAccount.findFirst({
        where: { id: bankAccountId, ...accessibleAccounts(membership) },
        select: { id: true, currency: true },
      }),
      this.prisma.accountingPeriod.findFirst({
        where: { id: periodId, organizationId: membership.organizationId },
        select: { id: true, year: true, month: true },
      }),
      this.currentRule(membership.organizationId),
    ]);
    if (!account || !period) throw Errors.notFound('La cuenta o el periodo');

    const periodStart = new Date(Date.UTC(period.year, period.month - 1, 1));
    const nextPeriod = new Date(Date.UTC(period.year, period.month, 1));
    const where = {
      organizationId: membership.organizationId,
      bankAccountId,
      operationDate: { lt: nextPeriod },
      period: {
        OR: [{ year: { lt: period.year } }, { year: period.year, month: { lte: period.month } }],
      },
      confirmedMatchItems: { none: { isActive: true } },
    };
    const [bankRows, bookRows, holidays] = await Promise.all([
      this.prisma.bankTransaction.findMany({
        where,
        orderBy: [{ operationDate: 'asc' }, { id: 'asc' }],
      }),
      this.prisma.accountingTransaction.findMany({
        where,
        orderBy: [{ operationDate: 'asc' }, { id: 'asc' }],
      }),
      this.prisma.holiday.findMany({
        where: {
          organizationId: membership.organizationId,
          date: {
            gte: new Date(Date.UTC(period.year, 0, 1)),
            lt: new Date(Date.UTC(period.year + 1, 0, 1)),
          },
        },
        select: { date: true },
      }),
    ]);
    const toCanonical = (
      row: (typeof bankRows)[number] | (typeof bookRows)[number],
      side: 'BANK' | 'BOOK',
    ): MatchTransaction => ({
      id: row.id,
      side,
      date: row.operationDate.toISOString().slice(0, 10),
      amountCents: parseAmount(row.amount.toFixed(2)),
      currency: row.currency,
      reference: row.reference,
      externalId: row.externalId,
      documentNumber: row.documentNumber,
      description: row.descriptionNormalized,
      duplicateStatus: row.duplicateStatus,
      carryover: row.operationDate < periodStart,
    });
    const transactions: MatchTransaction[] = [
      ...bankRows.map((row) => toCanonical(row, 'BANK')),
      ...bookRows.map((row) => toCanonical(row, 'BOOK')),
    ];
    if (transactions.some((tx) => tx.currency !== account.currency))
      throw Errors.conflict(
        'CURRENCY_MISMATCH',
        'Hay movimientos con moneda distinta a la moneda de la cuenta.',
      );

    const fingerprint = createHash('sha256')
      .update(
        transactions
          .map(
            (tx) =>
              `${tx.side}:${tx.id}:${tx.date}:${tx.amountCents}:${tx.currency}:${tx.reference ?? ''}`,
          )
          .join('\n'),
      )
      .digest('hex');
    const suggestions = suggestMatches(transactions, {
      dateToleranceBusinessDays: rule.dateToleranceBusinessDays,
      amountToleranceCents: parseAmount(rule.amountTolerance.toFixed(2)),
      amountToleranceBasisPoints: rule.amountToleranceBasisPoints,
      maxGroupSize: rule.maxGroupSize,
      holidays: holidays.map((h) => h.date.toISOString().slice(0, 10)),
    });

    let run: RunWithRule;
    try {
      run = await this.prisma.$transaction(async (tx) => {
        const created = await tx.matchingRun.create({
          data: {
            organizationId: membership.organizationId,
            bankAccountId,
            periodId,
            ruleVersionId: rule.id,
            inputFingerprint: fingerprint,
            idempotencyKey,
            bankTransactionCount: transactions.filter((x) => x.side === 'BANK').length,
            bookTransactionCount: transactions.filter((x) => x.side === 'BOOK').length,
            suggestionCount: suggestions.length,
            createdBy: user.id,
          },
        });
        if (suggestions.length) {
          await tx.matchingSuggestion.createMany({
            data: suggestions.map((s) => ({
              runId: created.id,
              rule: s.rule,
              status: s.status,
              score: s.score,
              bankTransactionIds: s.bankTransactionIds as unknown as Prisma.InputJsonValue,
              accountingTransactionIds: s.bookTransactionIds as unknown as Prisma.InputJsonValue,
              amountDifference: toAmountString(s.amountDifferenceCents),
              dateDifferenceDays: s.dateDifferenceBusinessDays,
              explanation: s.explanation,
              feeType: s.feeType,
            })),
          });
        }
        await this.audit.record(
          {
            action: 'MATCHING_RUN_CREATED',
            entity: 'matching_run',
            entityId: created.id,
            after: {
              bankAccountId,
              periodId,
              ruleVersion: rule.version,
              fingerprint,
              suggestionCount: suggestions.length,
            },
          },
          tx,
        );
        return tx.matchingRun.findUniqueOrThrow({
          where: { id: created.id },
          include: runPresentation,
        });
      });
    } catch (error) {
      if (
        typeof error === 'object' &&
        error !== null &&
        'code' in error &&
        error.code === 'P2002'
      ) {
        const concurrent = await this.prisma.matchingRun.findFirst({
          where: { organizationId: membership.organizationId, idempotencyKey },
          include: runPresentation,
        });
        if (concurrent?.bankAccountId === bankAccountId && concurrent.periodId === periodId)
          return this.presentRun(concurrent);
        if (concurrent)
          throw Errors.conflict(
            'IDEMPOTENCY_KEY_REUSED',
            'La clave de idempotencia ya se usó con otra cuenta o periodo.',
          );
      }
      throw error;
    }
    return this.presentRun(run);
  }

  async listRuns(membership: ActiveMembership, bankAccountId?: string, periodId?: string) {
    if (bankAccountId) assertAccountAccess(membership, bankAccountId);
    const rows = await this.prisma.matchingRun.findMany({
      where: {
        organizationId: membership.organizationId,
        bankAccount: accessibleAccounts(membership),
        ...(bankAccountId && { bankAccountId }),
        ...(periodId && { periodId }),
      },
      orderBy: { createdAt: 'desc' },
      include: runPresentation,
    });
    return rows.map((r) => this.presentRun(r));
  }

  async getRun(membership: ActiveMembership, id: string) {
    const run = await this.prisma.matchingRun.findFirst({
      where: {
        id,
        organizationId: membership.organizationId,
        bankAccount: accessibleAccounts(membership),
      },
      include: runPresentation,
    });
    if (!run) throw Errors.notFound('La ejecución');
    return this.presentRun(run);
  }

  async listSuggestions(
    membership: ActiveMembership,
    runId: string,
    query: {
      page: number;
      pageSize: number;
      status?: string;
      resultGroup?: 'DIFFERENCES' | 'UNMATCHED' | 'DUPLICATES';
    },
  ) {
    const run = await this.prisma.matchingRun.findFirst({
      where: {
        id: runId,
        organizationId: membership.organizationId,
        bankAccount: accessibleAccounts(membership),
      },
      select: { id: true, organizationId: true, bankAccountId: true, periodId: true },
    });
    if (!run) throw Errors.notFound('La ejecución');
    const resultStatuses: Record<'DIFFERENCES' | 'UNMATCHED' | 'DUPLICATES', string[]> = {
      DIFFERENCES: ['AMOUNT_DIFFERENCE', 'DATE_DIFFERENCE'],
      UNMATCHED: ['BANK_UNMATCHED', 'BOOK_UNMATCHED', 'CARRIED_FORWARD'],
      DUPLICATES: ['POSSIBLE_DUPLICATE'],
    } as const;
    const where = {
      runId,
      ...(query.status && { reviewStatus: query.status as never }),
      ...(query.resultGroup && { status: { in: resultStatuses[query.resultGroup] as never } }),
    };
    const [total, rows] = await Promise.all([
      this.prisma.matchingSuggestion.count({ where }),
      this.prisma.matchingSuggestion.findMany({
        where,
        orderBy: [{ reviewStatus: 'asc' }, { score: 'desc' }, { createdAt: 'asc' }],
        skip: (query.page - 1) * query.pageSize,
        take: query.pageSize,
      }),
    ]);
    const bankIds = [...new Set(rows.flatMap((row) => row.bankTransactionIds as string[]))];
    const bookIds = [...new Set(rows.flatMap((row) => row.accountingTransactionIds as string[]))];
    const [banks, books] = await Promise.all([
      this.prisma.bankTransaction.findMany({
        where: {
          id: { in: bankIds },
          organizationId: run.organizationId,
          bankAccountId: run.bankAccountId,
        },
      }),
      this.prisma.accountingTransaction.findMany({
        where: {
          id: { in: bookIds },
          organizationId: run.organizationId,
          bankAccountId: run.bankAccountId,
        },
      }),
    ]);
    const bankMap = new Map(banks.map((row) => [row.id, row]));
    const bookMap = new Map(books.map((row) => [row.id, row]));
    return {
      page: query.page,
      pageSize: query.pageSize,
      total,
      data: rows.map((row) => ({
        ...this.presentSuggestion(row),
        bankTransactions: (row.bankTransactionIds as string[]).flatMap((id) => {
          const tx = bankMap.get(id);
          return tx ? [this.presentWorkbenchTx(tx, 'BANK')] : [];
        }),
        accountingTransactions: (row.accountingTransactionIds as string[]).flatMap((id) => {
          const tx = bookMap.get(id);
          return tx ? [this.presentWorkbenchTx(tx, 'BOOK')] : [];
        }),
      })),
    };
  }

  private presentWorkbenchTx(
    row: {
      id: string;
      operationDate: Date;
      valueDate: Date | null;
      descriptionOriginal: string;
      descriptionNormalized: string;
      reference: string | null;
      documentNumber: string | null;
      amount: { toFixed(n: number): string };
      currency: string;
      duplicateStatus: string;
    },
    side: 'BANK' | 'BOOK',
  ) {
    return {
      id: row.id,
      side,
      operationDate: row.operationDate.toISOString().slice(0, 10),
      valueDate: row.valueDate?.toISOString().slice(0, 10) ?? null,
      description: row.descriptionOriginal,
      normalizedDescription: row.descriptionNormalized,
      reference: row.reference,
      documentNumber: row.documentNumber,
      amount: row.amount.toFixed(2),
      currency: row.currency,
      duplicateStatus: row.duplicateStatus,
    };
  }

  private presentSuggestion(row: {
    id: string;
    rule: string;
    status: string;
    reviewStatus: string;
    score: number;
    bankTransactionIds: unknown;
    accountingTransactionIds: unknown;
    amountDifference: { toFixed(n: number): string };
    dateDifferenceDays: number;
    explanation: string;
    feeType: string | null;
    createdAt: Date;
  }) {
    return {
      id: row.id,
      rule: row.rule,
      status: row.status,
      reviewStatus: row.reviewStatus,
      score: row.score,
      bankTransactionIds: row.bankTransactionIds,
      accountingTransactionIds: row.accountingTransactionIds,
      amountDifference: row.amountDifference.toFixed(2),
      dateDifferenceDays: row.dateDifferenceDays,
      explanation: row.explanation,
      feeType: row.feeType,
      createdAt: row.createdAt,
    };
  }

  async listWorkbenchTransactions(
    membership: ActiveMembership,
    runId: string,
    query: { side: 'BANK' | 'BOOK'; page: number; pageSize: number; search?: string },
  ) {
    const run = await this.prisma.matchingRun.findFirst({
      where: {
        id: runId,
        organizationId: membership.organizationId,
        bankAccount: accessibleAccounts(membership),
      },
      include: { period: { select: { year: true, month: true } } },
    });
    if (!run) throw Errors.notFound('La ejecución');
    const where = {
      organizationId: membership.organizationId,
      bankAccountId: run.bankAccountId,
      operationDate: { lt: new Date(Date.UTC(run.period.year, run.period.month, 1)) },
      period: {
        OR: [
          { year: { lt: run.period.year } },
          { year: run.period.year, month: { lte: run.period.month } },
        ],
      },
      confirmedMatchItems: { none: { isActive: true } },
      ...(query.search && {
        OR: [
          { descriptionNormalized: { contains: query.search, mode: 'insensitive' as const } },
          { descriptionOriginal: { contains: query.search, mode: 'insensitive' as const } },
          { reference: { contains: query.search, mode: 'insensitive' as const } },
          { documentNumber: { contains: query.search, mode: 'insensitive' as const } },
        ],
      }),
    };
    const [total, rows] =
      query.side === 'BANK'
        ? await Promise.all([
            this.prisma.bankTransaction.count({ where }),
            this.prisma.bankTransaction.findMany({
              where,
              orderBy: [{ operationDate: 'asc' }, { id: 'asc' }],
              skip: (query.page - 1) * query.pageSize,
              take: query.pageSize,
            }),
          ])
        : await Promise.all([
            this.prisma.accountingTransaction.count({ where }),
            this.prisma.accountingTransaction.findMany({
              where,
              orderBy: [{ operationDate: 'asc' }, { id: 'asc' }],
              skip: (query.page - 1) * query.pageSize,
              take: query.pageSize,
            }),
          ]);
    return {
      page: query.page,
      pageSize: query.pageSize,
      total,
      data: rows.map((row) => ({
        id: row.id,
        side: query.side,
        operationDate: row.operationDate.toISOString().slice(0, 10),
        valueDate: row.valueDate?.toISOString().slice(0, 10) ?? null,
        description: row.descriptionOriginal,
        normalizedDescription: row.descriptionNormalized,
        reference: row.reference,
        documentNumber: row.documentNumber,
        amount: row.amount.toFixed(2),
        currency: row.currency,
        duplicateStatus: row.duplicateStatus,
        carryover: row.operationDate < new Date(Date.UTC(run.period.year, run.period.month - 1, 1)),
      })),
    };
  }

  async listConfirmedMatches(membership: ActiveMembership, runId: string) {
    const run = await this.prisma.matchingRun.findFirst({
      where: {
        id: runId,
        organizationId: membership.organizationId,
        bankAccount: accessibleAccounts(membership),
      },
      select: { id: true },
    });
    if (!run) throw Errors.notFound('La ejecución');
    const rows = await this.prisma.confirmedMatch.findMany({
      where: { runId, organizationId: membership.organizationId },
      orderBy: { confirmedAt: 'desc' },
      include: { items: true, suggestion: { select: { explanation: true, status: true } } },
    });
    return rows;
  }

  async getRunSummary(membership: ActiveMembership, runId: string) {
    const run = await this.prisma.matchingRun.findFirst({
      where: {
        id: runId,
        organizationId: membership.organizationId,
        bankAccount: accessibleAccounts(membership),
      },
      include: { period: { select: { year: true, month: true } } },
    });
    if (!run) throw Errors.notFound('La ejecución');
    const through = new Date(Date.UTC(run.period.year, run.period.month, 1));
    const periodFilter = {
      organizationId: membership.organizationId,
      bankAccountId: run.bankAccountId,
      operationDate: { lt: through },
      period: {
        OR: [
          { year: { lt: run.period.year } },
          { year: run.period.year, month: { lte: run.period.month } },
        ],
      },
      duplicateStatus: { not: 'CONFIRMED' as const },
    };
    const summarize = async (side: 'BANK' | 'BOOK') => {
      const totalArgs = {
        where: periodFilter,
        _count: { _all: true },
        _sum: { amount: true },
      } as const;
      const matchedArgs = {
        where: { ...periodFilter, confirmedMatchItems: { some: { isActive: true } } },
        _count: { _all: true },
        _sum: { amount: true },
      } as const;
      const unmatchedArgs = {
        where: { ...periodFilter, confirmedMatchItems: { none: { isActive: true } } },
        _count: { _all: true },
        _sum: { amount: true },
      } as const;
      const [total, matched, unmatched] =
        side === 'BANK'
          ? await Promise.all([
              this.prisma.bankTransaction.aggregate(totalArgs),
              this.prisma.bankTransaction.aggregate(matchedArgs),
              this.prisma.bankTransaction.aggregate(unmatchedArgs),
            ])
          : await Promise.all([
              this.prisma.accountingTransaction.aggregate(totalArgs),
              this.prisma.accountingTransaction.aggregate(matchedArgs),
              this.prisma.accountingTransaction.aggregate(unmatchedArgs),
            ]);
      return {
        movementCount: total._count._all,
        movementNet: total._sum.amount?.toFixed(2) ?? '0.00',
        matchedMovementCount: matched._count._all,
        matchedMovementNet: matched._sum.amount?.toFixed(2) ?? '0.00',
        pendingMovementCount: unmatched._count._all,
        pendingMovementNet: unmatched._sum.amount?.toFixed(2) ?? '0.00',
      };
    };
    const [bank, book] = await Promise.all([summarize('BANK'), summarize('BOOK')]);
    return {
      runId,
      bank,
      book,
      movementDifference: toAmountString(
        parseAmount(bank.movementNet) + parseAmount(book.movementNet),
      ),
      matchedDifference: toAmountString(
        parseAmount(bank.matchedMovementNet) + parseAmount(book.matchedMovementNet),
      ),
      pendingDifference: toAmountString(
        parseAmount(bank.pendingMovementNet) + parseAmount(book.pendingMovementNet),
      ),
    };
  }

  private presentRun(run: {
    id: string;
    bankAccountId: string;
    periodId: string;
    status: string;
    inputFingerprint: string;
    bankTransactionCount: number;
    bookTransactionCount: number;
    suggestionCount: number;
    createdAt: Date;
    ruleVersion: { version: number; dateToleranceBusinessDays: number; maxGroupSize: number };
    bankAccount: { name: string; accountLast4: string; bank: { name: string } };
    period: { year: number; month: number };
  }) {
    return {
      id: run.id,
      bankAccountId: run.bankAccountId,
      periodId: run.periodId,
      status: run.status,
      inputFingerprint: run.inputFingerprint,
      bankTransactionCount: run.bankTransactionCount,
      bookTransactionCount: run.bookTransactionCount,
      suggestionCount: run.suggestionCount,
      ruleVersion: run.ruleVersion,
      createdAt: run.createdAt,
      bankAccount: run.bankAccount,
      period: run.period,
    };
  }

  async confirmSuggestion(
    membership: ActiveMembership,
    user: AuthUser,
    suggestionId: string,
    reason?: string,
  ) {
    const suggestion = await this.prisma.matchingSuggestion.findFirst({
      where: {
        id: suggestionId,
        run: {
          organizationId: membership.organizationId,
          bankAccount: accessibleAccounts(membership),
        },
      },
      include: { run: true },
    });
    if (!suggestion) throw Errors.notFound('La propuesta');
    if (suggestion.reviewStatus !== 'OPEN' && suggestion.reviewStatus !== 'REQUIRES_REVIEW')
      throw Errors.conflict(
        'SUGGESTION_ALREADY_REVIEWED',
        'La propuesta ya tiene una decisión registrada.',
      );
    if (!['EXACT', 'PROBABLE', 'AMOUNT_DIFFERENCE', 'DATE_DIFFERENCE'].includes(suggestion.status))
      throw Errors.conflict(
        'MATCH_NOT_CONFIRMABLE',
        'Esta propuesta requiere revisión manual y no se puede confirmar directamente.',
      );
    if (['AMOUNT_DIFFERENCE', 'DATE_DIFFERENCE'].includes(suggestion.status) && !reason)
      throw Errors.badRequest(
        'MATCH_REASON_REQUIRED',
        'Justifique la diferencia antes de confirmar esta propuesta.',
      );
    const bankIds = suggestion.bankTransactionIds as string[];
    const bookIds = suggestion.accountingTransactionIds as string[];
    if (!bankIds.length || !bookIds.length)
      throw Errors.conflict(
        'MATCH_INCOMPLETE',
        'La propuesta debe incluir movimientos de ambos lados.',
      );
    const where = {
      organizationId: membership.organizationId,
      bankAccountId: suggestion.run.bankAccountId,
      periodId: suggestion.run.periodId,
    };
    const [banks, books] = await Promise.all([
      this.prisma.bankTransaction.findMany({
        where: { ...where, id: { in: bankIds } },
        select: { id: true, duplicateStatus: true },
      }),
      this.prisma.accountingTransaction.findMany({
        where: { ...where, id: { in: bookIds } },
        select: { id: true, duplicateStatus: true },
      }),
    ]);
    if (
      banks.length !== bankIds.length ||
      books.length !== bookIds.length ||
      [...banks, ...books].some((x) => x.duplicateStatus === 'CONFIRMED')
    )
      throw Errors.conflict(
        'MATCH_INPUT_CHANGED',
        'Los movimientos propuestos ya no están disponibles para conciliar.',
      );
    try {
      const match = await this.prisma.$transaction(async (tx) => {
        const created = await tx.confirmedMatch.create({
          data: {
            organizationId: membership.organizationId,
            bankAccountId: suggestion.run.bankAccountId,
            periodId: suggestion.run.periodId,
            runId: suggestion.runId,
            suggestionId,
            confirmedBy: user.id,
            items: {
              create: [
                ...bankIds.map((bankTransactionId) => ({
                  side: 'BANK' as const,
                  bankTransactionId,
                })),
                ...bookIds.map((accountingTransactionId) => ({
                  side: 'BOOK' as const,
                  accountingTransactionId,
                })),
              ],
            },
          },
          include: { items: true },
        });
        await tx.matchingSuggestion.update({
          where: { id: suggestionId },
          data: { reviewStatus: 'CONFIRMED' },
        });
        await this.audit.record(
          {
            action: 'MATCH_CONFIRMED',
            entity: 'confirmed_match',
            entityId: created.id,
            after: { suggestionId, bankIds, bookIds },
            reason,
          },
          tx,
        );
        return created;
      });
      return match;
    } catch (error) {
      if (typeof error === 'object' && error !== null && 'code' in error && error.code === 'P2002')
        throw Errors.conflict(
          'TRANSACTION_ALREADY_MATCHED',
          'Uno o más movimientos ya fueron conciliados por otra ejecución.',
        );
      throw error;
    }
  }

  async decideSuggestion(
    membership: ActiveMembership,
    user: AuthUser,
    suggestionId: string,
    decision: 'REJECTED' | 'REQUIRES_REVIEW',
    reason: string,
  ) {
    const suggestion = await this.prisma.matchingSuggestion.findFirst({
      where: {
        id: suggestionId,
        run: {
          organizationId: membership.organizationId,
          bankAccount: accessibleAccounts(membership),
        },
      },
    });
    if (!suggestion) throw Errors.notFound('La propuesta');
    if (suggestion.reviewStatus !== 'OPEN' && suggestion.reviewStatus !== 'REQUIRES_REVIEW')
      throw Errors.conflict(
        'SUGGESTION_ALREADY_REVIEWED',
        'La propuesta ya tiene una decisión registrada.',
      );
    const updated = await this.prisma.$transaction(async (tx) => {
      const row = await tx.matchingSuggestion.update({
        where: { id: suggestionId },
        data: { reviewStatus: decision },
      });
      await this.audit.record(
        {
          action:
            decision === 'REJECTED'
              ? 'MATCH_SUGGESTION_REJECTED'
              : 'MATCH_SUGGESTION_REVIEW_REQUESTED',
          entity: 'matching_suggestion',
          entityId: suggestionId,
          before: { reviewStatus: suggestion.reviewStatus },
          after: { reviewStatus: decision },
          reason,
          actorId: user.id,
        },
        tx,
      );
      return row;
    });
    return this.presentSuggestion(updated);
  }

  async createManualMatch(
    membership: ActiveMembership,
    user: AuthUser,
    runId: string,
    bankIds: string[],
    bookIds: string[],
    reason: string,
  ) {
    if (new Set(bankIds).size !== bankIds.length || new Set(bookIds).size !== bookIds.length)
      throw Errors.badRequest(
        'DUPLICATE_TRANSACTION_ID',
        'No repita movimientos dentro de la selección.',
      );
    const run = await this.prisma.matchingRun.findFirst({
      where: {
        id: runId,
        organizationId: membership.organizationId,
        bankAccount: accessibleAccounts(membership),
      },
      include: {
        period: { select: { year: true, month: true } },
        bankAccount: { select: { currency: true } },
      },
    });
    if (!run) throw Errors.notFound('La ejecución');
    const transactionWhere = {
      organizationId: membership.organizationId,
      bankAccountId: run.bankAccountId,
      operationDate: { lt: new Date(Date.UTC(run.period.year, run.period.month, 1)) },
      period: {
        OR: [
          { year: { lt: run.period.year } },
          { year: run.period.year, month: { lte: run.period.month } },
        ],
      },
      confirmedMatchItems: { none: { isActive: true } },
    };
    const [banks, books] = await Promise.all([
      this.prisma.bankTransaction.findMany({ where: { ...transactionWhere, id: { in: bankIds } } }),
      this.prisma.accountingTransaction.findMany({
        where: { ...transactionWhere, id: { in: bookIds } },
      }),
    ]);
    if (banks.length !== bankIds.length || books.length !== bookIds.length)
      throw Errors.conflict(
        'MANUAL_MATCH_INPUT_CHANGED',
        'Uno o más movimientos no están disponibles para conciliar.',
      );
    if ([...banks, ...books].some((row) => row.duplicateStatus === 'CONFIRMED'))
      throw Errors.conflict(
        'CONFIRMED_DUPLICATE',
        'Los duplicados confirmados no se pueden conciliar.',
      );
    if ([...banks, ...books].some((row) => row.currency !== run.bankAccount.currency))
      throw Errors.conflict(
        'CURRENCY_MISMATCH',
        'No se pueden asociar movimientos de otra moneda.',
      );
    const amountDifference =
      banks.reduce((sum, row) => sum + parseAmount(row.amount.toFixed(2)), 0n) +
      books.reduce((sum, row) => sum + parseAmount(row.amount.toFixed(2)), 0n);
    try {
      return await this.prisma.$transaction(async (tx) => {
        const suggestion = await tx.matchingSuggestion.create({
          data: {
            runId,
            rule: amountDifference === 0n ? 'EXACT' : 'APPROXIMATE',
            status: amountDifference === 0n ? 'PROBABLE' : 'AMOUNT_DIFFERENCE',
            reviewStatus: 'CONFIRMED',
            score: amountDifference === 0n ? 100 : 50,
            bankTransactionIds: bankIds,
            accountingTransactionIds: bookIds,
            amountDifference: toAmountString(amountDifference),
            explanation: 'Asociación manual realizada por un usuario autorizado.',
          },
        });
        const confirmed = await tx.confirmedMatch.create({
          data: {
            organizationId: membership.organizationId,
            bankAccountId: run.bankAccountId,
            periodId: run.periodId,
            runId,
            suggestionId: suggestion.id,
            confirmedBy: user.id,
            items: {
              create: [
                ...bankIds.map((bankTransactionId) => ({
                  side: 'BANK' as const,
                  bankTransactionId,
                })),
                ...bookIds.map((accountingTransactionId) => ({
                  side: 'BOOK' as const,
                  accountingTransactionId,
                })),
              ],
            },
          },
          include: { items: true },
        });
        await this.audit.record(
          {
            action: 'MANUAL_MATCH_CONFIRMED',
            entity: 'confirmed_match',
            entityId: confirmed.id,
            after: {
              suggestionId: suggestion.id,
              bankIds,
              bookIds,
              amountDifference: toAmountString(amountDifference),
            },
            reason,
            actorId: user.id,
          },
          tx,
        );
        return confirmed;
      });
    } catch (error) {
      if (typeof error === 'object' && error !== null && 'code' in error && error.code === 'P2002')
        throw Errors.conflict(
          'TRANSACTION_ALREADY_MATCHED',
          'Uno o más movimientos ya fueron conciliados por otra ejecución.',
        );
      throw error;
    }
  }

  async reverseMatch(
    membership: ActiveMembership,
    user: AuthUser,
    matchId: string,
    reason: string,
  ) {
    const existing = await this.prisma.confirmedMatch.findFirst({
      where: {
        id: matchId,
        organizationId: membership.organizationId,
        bankAccount: accessibleAccounts(membership),
        status: 'CONFIRMED',
      },
      include: { items: true },
    });
    if (!existing) throw Errors.notFound('La conciliación confirmada');
    const updated = await this.prisma.$transaction(async (tx) => {
      const result = await tx.confirmedMatch.update({
        where: { id: matchId },
        data: {
          status: 'REVERSED',
          reversedBy: user.id,
          reversedAt: new Date(),
          reversalReason: reason,
          items: { updateMany: { where: { isActive: true }, data: { isActive: false } } },
        },
        include: { items: true },
      });
      await tx.matchingSuggestion.update({
        where: { id: existing.suggestionId },
        data: { reviewStatus: 'REVERSED' },
      });
      await this.audit.record(
        {
          action: 'MATCH_REVERSED',
          entity: 'confirmed_match',
          entityId: matchId,
          before: { status: existing.status },
          after: { status: result.status },
          reason,
        },
        tx,
      );
      return result;
    });
    return updated;
  }

  async listReconciliations(membership: ActiveMembership) {
    return this.prisma.reconciliation.findMany({
      where: {
        organizationId: membership.organizationId,
        bankAccount: accessibleAccounts(membership),
      },
      include: {
        bankAccount: { select: { name: true, accountLast4: true } },
        period: true,
        adjustments: true,
      },
      orderBy: { updatedAt: 'desc' },
    });
  }

  async createReconciliation(membership: ActiveMembership, user: AuthUser, runId: string) {
    const run = await this.prisma.matchingRun.findFirst({
      where: {
        id: runId,
        organizationId: membership.organizationId,
        bankAccount: accessibleAccounts(membership),
      },
    });
    if (!run) throw Errors.notFound('La ejecución');
    try {
      const record = await this.prisma.reconciliation.create({
        data: {
          organizationId: membership.organizationId,
          bankAccountId: run.bankAccountId,
          periodId: run.periodId,
          preparedBy: user.id,
        },
      });
      await this.audit.record({
        action: 'RECONCILIATION_PREPARED',
        entity: 'reconciliation',
        entityId: record.id,
        after: { runId, status: record.status },
        actorId: user.id,
      });
      return record;
    } catch (error) {
      if (typeof error === 'object' && error !== null && 'code' in error && error.code === 'P2002')
        throw Errors.conflict(
          'RECONCILIATION_EXISTS',
          'Ya existe una conciliación para esta cuenta y periodo.',
        );
      throw error;
    }
  }

  async createAdjustment(
    membership: ActiveMembership,
    user: AuthUser,
    input: {
      reconciliationId: string;
      entryDate: string;
      description: string;
      currency: string;
      lines: { glAccountId: string; debit: string; credit: string; costCenter?: string }[];
    },
  ) {
    const record = await this.prisma.reconciliation.findFirst({
      where: {
        id: input.reconciliationId,
        organizationId: membership.organizationId,
        bankAccount: accessibleAccounts(membership),
        status: 'PREPARATION',
      },
      include: { bankAccount: { select: { currency: true } } },
    });
    if (!record)
      throw Errors.conflict(
        'RECONCILIATION_NOT_EDITABLE',
        'La conciliación no está en preparación o no está disponible.',
      );
    if (record.bankAccount.currency !== input.currency)
      throw Errors.conflict(
        'CURRENCY_MISMATCH',
        'La moneda del asiento debe coincidir con la cuenta bancaria.',
      );
    const ids = [...new Set(input.lines.map((line) => line.glAccountId))];
    const accounts = await this.prisma.glAccount.findMany({
      where: {
        id: { in: ids },
        organizationId: membership.organizationId,
        status: 'ACTIVE',
        acceptsMovement: true,
      },
    });
    if (accounts.length !== ids.length)
      throw Errors.badRequest(
        'INVALID_GL_ACCOUNT',
        'Cada línea debe usar una cuenta contable activa que acepte movimientos.',
      );
    for (const line of input.lines) {
      const debit = parseAmount(line.debit);
      const credit = parseAmount(line.credit);
      if (debit < 0n || credit < 0n || (debit === 0n) === (credit === 0n))
        throw Errors.badRequest(
          'INVALID_ADJUSTMENT_LINE',
          'Cada línea debe tener un débito o un crédito positivo, pero no ambos.',
        );
    }
    const entry = await this.prisma.adjustmentEntry.create({
      data: {
        organizationId: membership.organizationId,
        reconciliationId: record.id,
        entryDate: new Date(`${input.entryDate}T00:00:00.000Z`),
        description: input.description,
        currency: input.currency,
        createdBy: user.id,
        lines: {
          create: input.lines.map((line) => ({
            glAccountId: line.glAccountId,
            debit: line.debit,
            credit: line.credit,
            costCenter: line.costCenter,
          })),
        },
      },
      include: { lines: true },
    });
    await this.audit.record({
      action: 'ADJUSTMENT_DRAFT_CREATED',
      entity: 'adjustment_entry',
      entityId: entry.id,
      after: { reconciliationId: record.id, lineCount: entry.lines.length },
      actorId: user.id,
    });
    return entry;
  }

  async approveAdjustment(membership: ActiveMembership, user: AuthUser, entryId: string) {
    const entry = await this.prisma.adjustmentEntry.findFirst({
      where: {
        id: entryId,
        organizationId: membership.organizationId,
        reconciliation: { bankAccount: accessibleAccounts(membership), status: 'PREPARATION' },
      },
      include: { lines: true },
    });
    if (!entry || entry.status !== 'DRAFT')
      throw Errors.conflict(
        'ADJUSTMENT_NOT_EDITABLE',
        'Solo se pueden aprobar asientos en borrador de conciliaciones en preparación.',
      );
    if (entry.lines.length < 2)
      throw Errors.conflict('ADJUSTMENT_INCOMPLETE', 'El asiento requiere al menos dos líneas.');
    const debit = entry.lines.reduce((sum, line) => sum + parseAmount(line.debit.toFixed(2)), 0n);
    const credit = entry.lines.reduce((sum, line) => sum + parseAmount(line.credit.toFixed(2)), 0n);
    if (debit === 0n || debit !== credit)
      throw Errors.conflict(
        'ADJUSTMENT_NOT_BALANCED',
        'Los débitos y créditos deben ser iguales y mayores que cero.',
      );
    const approved = await this.prisma.adjustmentEntry.update({
      where: { id: entryId },
      data: { status: 'APPROVED', approvedBy: user.id, approvedAt: new Date() },
      include: { lines: true },
    });
    await this.audit.record({
      action: 'ADJUSTMENT_APPROVED',
      entity: 'adjustment_entry',
      entityId: entryId,
      before: { status: 'DRAFT' },
      after: { status: 'APPROVED', total: toAmountString(debit) },
      actorId: user.id,
    });
    return approved;
  }

  async transitionReconciliation(
    membership: ActiveMembership,
    user: AuthUser,
    id: string,
    action: 'submit' | 'review' | 'approve' | 'close',
    reason: string,
  ) {
    const record = await this.prisma.reconciliation.findFirst({
      where: {
        id,
        organizationId: membership.organizationId,
        bankAccount: accessibleAccounts(membership),
      },
      include: { adjustments: { where: { status: 'DRAFT' } } },
    });
    if (!record) throw Errors.notFound('La conciliación');
    const expected = {
      submit: 'PREPARATION',
      review: 'SUBMITTED',
      approve: 'REVIEWED',
      close: 'APPROVED',
    } as const;
    if (record.status !== expected[action])
      throw Errors.conflict(
        'INVALID_RECONCILIATION_TRANSITION',
        `No se puede ${action} desde el estado ${record.status}.`,
      );
    if (action === 'submit' && record.adjustments.length)
      throw Errors.conflict(
        'DRAFT_ADJUSTMENTS_REMAIN',
        'Apruebe o elimine los asientos en borrador antes de enviar a revisión.',
      );
    if (action === 'close') {
      const run = await this.prisma.matchingRun.findFirst({
        where: {
          organizationId: record.organizationId,
          bankAccountId: record.bankAccountId,
          periodId: record.periodId,
        },
        orderBy: { createdAt: 'desc' },
      });
      if (!run)
        throw Errors.conflict(
          'MATCHING_RUN_REQUIRED',
          'Ejecute la conciliación antes de cerrar el periodo.',
        );
      const summary = await this.getRunSummary(membership, run.id);
      if (summary.bank.pendingMovementCount || summary.book.pendingMovementCount)
        throw Errors.conflict(
          'UNCLASSIFIED_MOVEMENTS',
          'No se puede cerrar: todavía hay movimientos pendientes de clasificar.',
        );
      const totals = await this.prisma.adjustmentLine.aggregate({
        where: { entry: { reconciliationId: id, status: { in: ['APPROVED', 'EXPORTED'] } } },
        _sum: { debit: true, credit: true },
      });
      const snapshot = {
        closedAt: new Date().toISOString(),
        runId: run.id,
        summary,
        adjustments: {
          debit: totals._sum.debit?.toFixed(2) ?? '0.00',
          credit: totals._sum.credit?.toFixed(2) ?? '0.00',
        },
      };
      const closed = await this.prisma.reconciliation.update({
        where: { id },
        data: { status: 'CLOSED', closedAt: new Date(), snapshot, version: { increment: 1 } },
      });
      await this.audit.record({
        action: 'RECONCILIATION_CLOSED',
        entity: 'reconciliation',
        entityId: id,
        before: { status: record.status, version: record.version },
        after: { status: 'CLOSED', version: closed.version, snapshot },
        reason,
        actorId: user.id,
      });
      return closed;
    }
    const next = { submit: 'SUBMITTED', review: 'REVIEWED', approve: 'APPROVED' }[action] as
      'SUBMITTED' | 'REVIEWED' | 'APPROVED';
    const changed = await this.prisma.reconciliation.update({
      where: { id },
      data: {
        status: next,
        version: { increment: 1 },
        ...(action === 'submit' && { submittedAt: new Date() }),
        ...(action === 'review' && { reviewedBy: user.id, reviewedAt: new Date() }),
        ...(action === 'approve' && { approvedBy: user.id, approvedAt: new Date() }),
      },
    });
    await this.audit.record({
      action: `RECONCILIATION_${next}`,
      entity: 'reconciliation',
      entityId: id,
      before: { status: record.status, version: record.version },
      after: { status: next, version: changed.version },
      reason,
      actorId: user.id,
    });
    return changed;
  }

  async getReportData(membership: ActiveMembership, runId: string) {
    const run = await this.prisma.matchingRun.findFirst({
      where: {
        id: runId,
        organizationId: membership.organizationId,
        bankAccount: accessibleAccounts(membership),
      },
      include: runPresentation,
    });
    if (!run) throw Errors.notFound('La ejecución');
    const summary = await this.getRunSummary(membership, runId);
    const through = new Date(Date.UTC(run.period.year, run.period.month, 1));
    const where = {
      organizationId: membership.organizationId,
      bankAccountId: run.bankAccountId,
      operationDate: { lt: through },
      period: {
        OR: [
          { year: { lt: run.period.year } },
          { year: run.period.year, month: { lte: run.period.month } },
        ],
      },
      duplicateStatus: { not: 'CONFIRMED' as const },
    };
    const [bank, book, matches, suggestionStats, reconciliation] = await Promise.all([
      this.prisma.bankTransaction.findMany({
        where,
        orderBy: [{ operationDate: 'asc' }, { id: 'asc' }],
        include: { confirmedMatchItems: { where: { isActive: true }, select: { id: true } } },
      }),
      this.prisma.accountingTransaction.findMany({
        where,
        orderBy: [{ operationDate: 'asc' }, { id: 'asc' }],
        include: { confirmedMatchItems: { where: { isActive: true }, select: { id: true } } },
      }),
      this.prisma.confirmedMatch.findMany({
        where: {
          organizationId: membership.organizationId,
          bankAccountId: run.bankAccountId,
          periodId: run.periodId,
          status: 'CONFIRMED',
        },
        include: {
          suggestion: { select: { explanation: true, amountDifference: true } },
          items: true,
        },
        orderBy: { confirmedAt: 'asc' },
      }),
      this.prisma.matchingSuggestion.groupBy({
        by: ['status'],
        where: { runId },
        _count: { _all: true },
      }),
      this.prisma.reconciliation.findFirst({
        where: {
          organizationId: membership.organizationId,
          bankAccountId: run.bankAccountId,
          periodId: run.periodId,
        },
        include: {
          adjustments: {
            where: { status: { in: ['APPROVED', 'EXPORTED'] } },
            include: { lines: { include: { glAccount: { select: { code: true, name: true } } } } },
          },
        },
      }),
    ]);
    const present = (
      row: (typeof bank)[number] | (typeof book)[number],
      side: 'BANK' | 'BOOK',
    ) => ({
      id: row.id,
      side,
      operationDate: row.operationDate.toISOString().slice(0, 10),
      description: row.descriptionOriginal,
      reference: row.reference,
      documentNumber: row.documentNumber,
      amount: row.amount.toFixed(2),
      currency: row.currency,
      duplicateStatus: row.duplicateStatus,
      matchStatus: row.confirmedMatchItems.length ? 'CONCILIADO' : 'PENDIENTE',
    });
    return {
      generatedAt: new Date().toISOString(),
      run: this.presentRun(run),
      summary,
      suggestionStats: suggestionStats.map((item) => ({
        status: item.status,
        count: item._count._all,
      })),
      bankTransactions: bank.map((row) => present(row, 'BANK')),
      accountingTransactions: book.map((row) => present(row, 'BOOK')),
      matches: matches.map((match) => ({
        id: match.id,
        confirmedAt: match.confirmedAt.toISOString(),
        explanation: match.suggestion.explanation,
        amountDifference: match.suggestion.amountDifference.toFixed(2),
        itemCount: match.items.length,
      })),
      adjustments:
        reconciliation?.adjustments.flatMap((entry) =>
          entry.lines.map((line) => ({
            entryId: entry.id,
            description: entry.description,
            entryDate: entry.entryDate.toISOString().slice(0, 10),
            code: line.glAccount.code,
            account: line.glAccount.name,
            debit: line.debit.toFixed(2),
            credit: line.credit.toFixed(2),
            currency: entry.currency,
          })),
        ) ?? [],
      reconciliation: reconciliation
        ? {
            status: reconciliation.status,
            version: reconciliation.version,
            closedAt: reconciliation.closedAt?.toISOString() ?? null,
            snapshot: reconciliation.snapshot,
          }
        : null,
    };
  }
}
