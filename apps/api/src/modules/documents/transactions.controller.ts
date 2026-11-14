import { Body, Controller, Get, HttpCode, Param, ParseUUIDPipe, Post, Query } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { DuplicateDecisionRequest } from '@finagent/contracts';
import { z } from 'zod';
import { Errors } from '../../common/errors.js';
import { ZodPipe } from '../../common/zod.pipe.js';
import { PrismaService } from '../../infrastructure/prisma.service.js';
import { AuditService } from '../audit/audit.service.js';
import { type ActiveMembership, CurrentMembership, Org } from '../auth/decorators.js';
import { accessibleAccounts } from '../master-data/account-access.js';

const ListQuery = z.object({
  side: z.enum(['BANK', 'BOOK']),
  bankAccountId: z.uuid().optional(),
  documentId: z.uuid().optional(),
  year: z.coerce.number().int().optional(),
  month: z.coerce.number().int().min(1).max(12).optional(),
  duplicates: z.enum(['true']).optional(),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(500).default(100),
});

const present = (t: {
  operationDate: Date;
  valueDate: Date | null;
  amount: { toFixed(n: number): string };
  runningBalance: { toFixed(n: number): string } | null;
}) => ({
  ...t,
  operationDate: t.operationDate.toISOString().slice(0, 10),
  valueDate: t.valueDate?.toISOString().slice(0, 10) ?? null,
  amount: t.amount.toFixed(2),
  runningBalance: t.runningBalance?.toFixed(2) ?? null,
});

@ApiTags('transactions')
@Controller('transactions')
export class TransactionsController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  /** Movimientos normalizados (paginados en el servidor). */
  @Get()
  @Org('reconciliations.read')
  async list(
    @CurrentMembership() m: ActiveMembership,
    @Query(new ZodPipe(ListQuery)) q: z.infer<typeof ListQuery>,
  ) {
    const where = {
      organizationId: m.organizationId,
      bankAccount: accessibleAccounts(m),
      ...(q.bankAccountId && { bankAccountId: q.bankAccountId }),
      ...(q.documentId && { documentId: q.documentId }),
      ...(q.duplicates && { duplicateStatus: 'POSSIBLE' as const }),
      ...((q.year || q.month) && {
        period: { ...(q.year && { year: q.year }), ...(q.month && { month: q.month }) },
      }),
    };
    const args = {
      where,
      orderBy: [{ operationDate: 'asc' as const }, { createdAt: 'asc' as const }],
      skip: (q.page - 1) * q.pageSize,
      take: q.pageSize,
    };
    const [total, rows] =
      q.side === 'BANK'
        ? await Promise.all([
            this.prisma.bankTransaction.count({ where }),
            this.prisma.bankTransaction.findMany(args),
          ])
        : await Promise.all([
            this.prisma.accountingTransaction.count({ where }),
            this.prisma.accountingTransaction.findMany(args),
          ]);
    return { data: rows.map(present), page: q.page, pageSize: q.pageSize, total };
  }

  /** Posible duplicado: el usuario confirma (es duplicado) o descarta (es legítimo). Nunca se elimina. */
  @Post(':id/duplicate-decision')
  @Org('reconciliations.prepare')
  @HttpCode(200)
  async decide(
    @CurrentMembership() m: ActiveMembership,
    @Param('id', ParseUUIDPipe) id: string,
    @Body(new ZodPipe(DuplicateDecisionRequest)) body: z.infer<typeof DuplicateDecisionRequest>,
  ) {
    const where = {
      id,
      organizationId: m.organizationId,
      bankAccount: accessibleAccounts(m),
      duplicateStatus: { in: ['POSSIBLE' as const, 'CONFIRMED' as const, 'DISMISSED' as const] },
    };
    const tx =
      body.side === 'BANK'
        ? await this.prisma.bankTransaction.findFirst({ where })
        : await this.prisma.accountingTransaction.findFirst({ where });
    if (!tx) throw Errors.notFound('El posible duplicado');
    const data = { duplicateStatus: body.decision };
    const updated =
      body.side === 'BANK'
        ? await this.prisma.bankTransaction.update({ where: { id }, data })
        : await this.prisma.accountingTransaction.update({ where: { id }, data });
    await this.audit.record({
      action: 'DUPLICATE_DECIDED',
      entity: body.side === 'BANK' ? 'bank_transaction' : 'accounting_transaction',
      entityId: id,
      before: { duplicateStatus: tx.duplicateStatus },
      after: { duplicateStatus: body.decision },
    });
    return present(updated);
  }
}
