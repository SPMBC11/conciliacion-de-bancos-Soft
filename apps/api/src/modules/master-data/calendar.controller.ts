import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  ParseUUIDPipe,
  Post,
  Query,
} from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { CreateHolidayRequest, OpenPeriodRequest } from '@finagent/contracts';
import { colombianHolidays } from '@finagent/domain';
import { z } from 'zod';
import { Errors } from '../../common/errors.js';
import { ZodPipe } from '../../common/zod.pipe.js';
import { PrismaService } from '../../infrastructure/prisma.service.js';
import { AuditService } from '../audit/audit.service.js';
import {
  type ActiveMembership,
  type AuthUser,
  CurrentMembership,
  CurrentUser,
  Org,
} from '../auth/decorators.js';
import { accessibleAccounts } from './account-access.js';

const YearQuery = z.object({ year: z.coerce.number().int().min(2000).max(2100) });

/** Mes actual en Bogotá (no se abren periodos futuros). */
function currentBogotaMonth() {
  const [y, mo] = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Bogota',
    year: 'numeric',
    month: '2-digit',
  })
    .format(new Date())
    .split('-');
  return Number(y) * 12 + Number(mo);
}

@ApiTags('calendar')
@Controller()
export class CalendarController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  // ---------- Festivos ----------

  /** Nacionales (calculados por ley, no editables) + adicionales de la organización. */
  @Get('holidays')
  @Org()
  async holidays(
    @CurrentMembership() m: ActiveMembership,
    @Query(new ZodPipe(YearQuery)) { year }: z.infer<typeof YearQuery>,
  ) {
    const custom = await this.prisma.holiday.findMany({
      where: {
        organizationId: m.organizationId,
        date: { gte: new Date(`${year}-01-01`), lte: new Date(`${year}-12-31`) },
      },
    });
    return [
      ...colombianHolidays(year).map((h) => ({
        id: null,
        date: h.date,
        name: h.name,
        source: 'NACIONAL' as const,
      })),
      ...custom.map((h) => ({
        id: h.id,
        date: h.date.toISOString().slice(0, 10),
        name: h.name,
        source: 'ORGANIZACION' as const,
      })),
    ].sort((a, b) => a.date.localeCompare(b.date));
  }

  @Post('holidays')
  @Org('master_data.manage')
  async addHoliday(
    @CurrentUser() user: AuthUser,
    @CurrentMembership() m: ActiveMembership,
    @Body(new ZodPipe(CreateHolidayRequest)) body: z.infer<typeof CreateHolidayRequest>,
  ) {
    const year = Number(body.date.slice(0, 4));
    if (colombianHolidays(year).some((h) => h.date === body.date)) {
      throw Errors.conflict('HOLIDAY_EXISTS', 'Esa fecha ya es festivo nacional.');
    }
    const exists = await this.prisma.holiday.findUnique({
      where: {
        organizationId_date: { organizationId: m.organizationId, date: new Date(body.date) },
      },
    });
    if (exists)
      throw Errors.conflict('HOLIDAY_EXISTS', 'Esa fecha ya está registrada como festivo.');
    const row = await this.prisma.holiday.create({
      data: {
        organizationId: m.organizationId,
        date: new Date(body.date),
        name: body.name,
        createdBy: user.id,
      },
    });
    await this.audit.record({
      action: 'HOLIDAY_CREATED',
      entity: 'holiday',
      entityId: row.id,
      after: body,
    });
    return { id: row.id, date: body.date, name: row.name, source: 'ORGANIZACION' };
  }

  @Delete('holidays/:id')
  @Org('master_data.manage')
  @HttpCode(204)
  async removeHoliday(
    @CurrentMembership() m: ActiveMembership,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    const row = await this.prisma.holiday.findFirst({
      where: { id, organizationId: m.organizationId },
    });
    if (!row) throw Errors.notFound('El festivo');
    await this.prisma.holiday.delete({ where: { id } });
    await this.audit.record({
      action: 'HOLIDAY_DELETED',
      entity: 'holiday',
      entityId: id,
      before: { date: row.date.toISOString().slice(0, 10), name: row.name },
    });
  }

  // ---------- Periodos ----------

  /**
   * Periodos del año con el estado por cuenta bancaria.
   * El estado por cuenta lo aportará la conciliación (Fase 6); mientras no exista, la cuenta está “Abierto”.
   */
  @Get('periods')
  @Org()
  async periods(
    @CurrentMembership() m: ActiveMembership,
    @Query(new ZodPipe(YearQuery)) { year }: z.infer<typeof YearQuery>,
  ) {
    const [periods, accounts] = await Promise.all([
      this.prisma.accountingPeriod.findMany({
        where: { organizationId: m.organizationId, year },
        orderBy: { month: 'asc' },
      }),
      this.prisma.bankAccount.findMany({
        where: { ...accessibleAccounts(m), status: 'ACTIVE' },
        orderBy: { name: 'asc' },
        select: { id: true, name: true, accountLast4: true, bank: { select: { name: true } } },
      }),
    ]);
    return {
      year,
      accounts: accounts.map((a) => ({
        id: a.id,
        name: a.name,
        bank: a.bank.name,
        maskedNumber: `****${a.accountLast4}`,
      })),
      periods: periods.map((p) => ({
        id: p.id,
        year: p.year,
        month: p.month,
        createdAt: p.createdAt,
        accounts: accounts.map((a) => ({ bankAccountId: a.id, status: 'ABIERTO' as const })),
      })),
    };
  }

  @Post('periods')
  @Org('master_data.manage')
  async openPeriod(
    @CurrentUser() user: AuthUser,
    @CurrentMembership() m: ActiveMembership,
    @Body(new ZodPipe(OpenPeriodRequest)) body: z.infer<typeof OpenPeriodRequest>,
  ) {
    if (body.year * 12 + body.month > currentBogotaMonth()) {
      throw Errors.badRequest('PERIOD_IN_FUTURE', 'No se puede abrir un periodo futuro.');
    }
    const key = { organizationId_year_month: { organizationId: m.organizationId, ...body } };
    if (await this.prisma.accountingPeriod.findUnique({ where: key })) {
      throw Errors.conflict('PERIOD_EXISTS', 'El periodo ya está abierto.');
    }
    const row = await this.prisma.accountingPeriod.create({
      data: { organizationId: m.organizationId, ...body, createdBy: user.id },
    });
    await this.audit.record({
      action: 'PERIOD_OPENED',
      entity: 'accounting_period',
      entityId: row.id,
      after: body,
    });
    return row;
  }
}
