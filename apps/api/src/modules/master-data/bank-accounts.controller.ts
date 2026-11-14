import { Body, Controller, Get, HttpCode, Param, ParseUUIDPipe, Patch, Post } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { CreateBankAccountRequest, UpdateBankAccountRequest } from '@finagent/contracts';
import { z } from 'zod';
import { Errors } from '../../common/errors.js';
import { ZodPipe } from '../../common/zod.pipe.js';
import { CryptoService } from '../../infrastructure/crypto.service.js';
import { PrismaService } from '../../infrastructure/prisma.service.js';
import { AuditService } from '../audit/audit.service.js';
import {
  type ActiveMembership,
  type AuthUser,
  CurrentMembership,
  CurrentUser,
  Org,
} from '../auth/decorators.js';
import { accessibleAccounts, assertAccountAccess } from './account-access.js';

const select = {
  id: true,
  name: true,
  accountLast4: true,
  type: true,
  currency: true,
  openingBalance: true,
  openingBalanceDate: true,
  openedAt: true,
  status: true,
  createdAt: true,
  bank: { select: { id: true, name: true } },
  glAccount: { select: { id: true, code: true, name: true } },
} as const;

type Row = { openingBalanceDate: Date; openedAt: Date | null; accountLast4: string };

/** Fechas contables como "AAAA-MM-DD" y número siempre enmascarado. */
function present<T extends Row>({ accountLast4, ...r }: T) {
  return {
    ...r,
    maskedNumber: `****${accountLast4}`,
    openingBalanceDate: r.openingBalanceDate.toISOString().slice(0, 10),
    openedAt: r.openedAt?.toISOString().slice(0, 10) ?? null,
  };
}

const CreateBank = z.object({ name: z.string().trim().min(3).max(100) });

@ApiTags('bank-accounts')
@Controller()
export class BankAccountsController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly crypto: CryptoService,
    private readonly audit: AuditService,
  ) {}

  @Get('banks')
  @Org()
  banks(@CurrentMembership() m: ActiveMembership) {
    return this.prisma.bank.findMany({
      where: { OR: [{ organizationId: null }, { organizationId: m.organizationId }] },
      orderBy: { name: 'asc' },
      select: { id: true, name: true, organizationId: true },
    });
  }

  @Post('banks')
  @Org('bank_accounts.manage')
  async createBank(
    @CurrentMembership() m: ActiveMembership,
    @Body(new ZodPipe(CreateBank)) body: z.infer<typeof CreateBank>,
  ) {
    const dup = await this.prisma.bank.findFirst({
      where: {
        name: { equals: body.name, mode: 'insensitive' },
        OR: [{ organizationId: null }, { organizationId: m.organizationId }],
      },
    });
    if (dup) throw Errors.conflict('BANK_EXISTS', 'Ese banco ya existe en el catálogo.');
    const bank = await this.prisma.bank.create({
      data: { organizationId: m.organizationId, name: body.name },
    });
    await this.audit.record({
      action: 'BANK_CREATED',
      entity: 'bank',
      entityId: bank.id,
      after: body,
    });
    return bank;
  }

  @Get('bank-accounts')
  @Org('bank_accounts.read')
  async list(@CurrentMembership() m: ActiveMembership) {
    const rows = await this.prisma.bankAccount.findMany({
      where: accessibleAccounts(m),
      orderBy: [{ status: 'asc' }, { bank: { name: 'asc' } }, { name: 'asc' }],
      select,
    });
    return rows.map(present);
  }

  @Get('bank-accounts/:id')
  @Org('bank_accounts.read')
  async get(@CurrentMembership() m: ActiveMembership, @Param('id', ParseUUIDPipe) id: string) {
    assertAccountAccess(m, id);
    const row = await this.prisma.bankAccount.findFirst({
      where: { id, organizationId: m.organizationId },
      select,
    });
    if (!row) throw Errors.notFound('La cuenta bancaria');
    return present(row);
  }

  private async validateGlAccount(organizationId: string, glAccountId: string) {
    const gl = await this.prisma.glAccount.findFirst({
      where: { id: glAccountId, organizationId },
    });
    if (!gl) throw Errors.notFound('La cuenta contable');
    if (!gl.acceptsMovement || gl.status !== 'ACTIVE') {
      throw Errors.badRequest(
        'GL_ACCOUNT_NOT_POSTABLE',
        'La cuenta contable debe estar activa y aceptar movimiento.',
      );
    }
    // 11 = Disponible (1110 Bancos, 1120 Cuentas de ahorro): evita asociar la cuenta a una contable equivocada.
    if (!gl.code.startsWith('11')) {
      throw Errors.badRequest(
        'GL_ACCOUNT_NOT_CASH',
        'La cuenta contable de un banco debe pertenecer al grupo 11 (Disponible).',
      );
    }
  }

  @Post('bank-accounts')
  @Org('bank_accounts.manage')
  async create(
    @CurrentUser() user: AuthUser,
    @CurrentMembership() m: ActiveMembership,
    @Body(new ZodPipe(CreateBankAccountRequest)) body: z.output<typeof CreateBankAccountRequest>,
  ) {
    const bank = await this.prisma.bank.findFirst({
      where: {
        id: body.bankId,
        OR: [{ organizationId: null }, { organizationId: m.organizationId }],
      },
    });
    if (!bank) throw Errors.notFound('El banco');
    await this.validateGlAccount(m.organizationId, body.glAccountId);

    const hmac = this.crypto.hmac(body.accountNumber);
    const dup = await this.prisma.bankAccount.findFirst({
      where: { organizationId: m.organizationId, bankId: body.bankId, accountNumberHmac: hmac },
    });
    if (dup)
      throw Errors.conflict(
        'BANK_ACCOUNT_EXISTS',
        'Esa cuenta ya está registrada para este banco.',
      );

    const row = await this.prisma.$transaction(async (tx) => {
      const created = await tx.bankAccount.create({
        data: {
          organizationId: m.organizationId,
          bankId: body.bankId,
          name: body.name,
          accountNumberEnc: this.crypto.encrypt(body.accountNumber),
          accountNumberHmac: hmac,
          accountLast4: body.accountNumber.slice(-4),
          type: body.type,
          currency: body.currency,
          glAccountId: body.glAccountId,
          openingBalance: body.openingBalance,
          openingBalanceDate: new Date(body.openingBalanceDate),
          openedAt: body.openedAt ? new Date(body.openedAt) : null,
          createdBy: user.id,
        },
        select,
      });
      const after = present(created);
      await this.audit.record(
        { action: 'BANK_ACCOUNT_CREATED', entity: 'bank_account', entityId: created.id, after },
        tx,
      );
      return after;
    });
    return row;
  }

  @Patch('bank-accounts/:id')
  @Org('bank_accounts.manage')
  async update(
    @CurrentMembership() m: ActiveMembership,
    @Param('id', ParseUUIDPipe) id: string,
    @Body(new ZodPipe(UpdateBankAccountRequest)) body: z.infer<typeof UpdateBankAccountRequest>,
  ) {
    assertAccountAccess(m, id);
    const before = await this.prisma.bankAccount.findFirst({
      where: { id, organizationId: m.organizationId },
      select,
    });
    if (!before) throw Errors.notFound('La cuenta bancaria');
    if (body.glAccountId) await this.validateGlAccount(m.organizationId, body.glAccountId);
    // Fase 6: el saldo inicial quedará bloqueado cuando exista una conciliación de la cuenta.
    const updated = await this.prisma.bankAccount.update({
      where: { id },
      data: {
        ...(body.name && { name: body.name }),
        ...(body.glAccountId && { glAccountId: body.glAccountId }),
        ...(body.status && { status: body.status }),
        ...(body.openingBalance && { openingBalance: body.openingBalance }),
        ...(body.openingBalanceDate && { openingBalanceDate: new Date(body.openingBalanceDate) }),
      },
      select,
    });
    const after = present(updated);
    await this.audit.record({
      action: 'BANK_ACCOUNT_UPDATED',
      entity: 'bank_account',
      entityId: id,
      before: present(before),
      after,
    });
    return after;
  }

  /** Número completo: solo con permiso de gestión y siempre queda en auditoría. */
  @Post('bank-accounts/:id/reveal-number')
  @Org('bank_accounts.manage')
  @HttpCode(200)
  async reveal(@CurrentMembership() m: ActiveMembership, @Param('id', ParseUUIDPipe) id: string) {
    assertAccountAccess(m, id);
    const row = await this.prisma.bankAccount.findFirst({
      where: { id, organizationId: m.organizationId },
    });
    if (!row) throw Errors.notFound('La cuenta bancaria');
    await this.audit.record({
      action: 'BANK_ACCOUNT_NUMBER_REVEALED',
      entity: 'bank_account',
      entityId: id,
    });
    return { accountNumber: this.crypto.decrypt(row.accountNumberEnc) };
  }
}
