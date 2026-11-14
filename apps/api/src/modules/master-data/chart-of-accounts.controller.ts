import {
  Body,
  Controller,
  Get,
  HttpCode,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Put,
  Query,
  UploadedFile,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { ApiTags } from '@nestjs/swagger';
import {
  FEE_TYPES,
  type FeeType,
  UpsertFeeMappingRequest,
  UpsertGlAccountRequest,
} from '@finagent/contracts';
import { defaultNature, pucLevel, pucParent } from '@finagent/domain';
import type { z } from 'zod';
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
import { PUC_BASE } from './puc-base.js';
import { missingParents, parsePucFile } from './puc-import.js';

const MAX_FILE_BYTES = 5 * 1024 * 1024;
/** Firmas de archivo: XLSX (ZIP "PK"), XLS (OLE2). CSV/TXT se valida como texto. */
function detectKind(buf: Buffer, filename: string): 'xlsx' | 'xls' | 'csv' | null {
  if (buf.subarray(0, 4).equals(Buffer.from([0x50, 0x4b, 0x03, 0x04]))) return 'xlsx';
  if (buf.subarray(0, 8).equals(Buffer.from([0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1])))
    return 'xls';
  if (/\.(csv|txt)$/i.test(filename) && !buf.subarray(0, 4096).includes(0)) return 'csv';
  return null;
}

type GlBody = z.infer<typeof UpsertGlAccountRequest>;

@ApiTags('chart-of-accounts')
@Controller()
export class ChartOfAccountsController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  @Get('chart-of-accounts')
  @Org()
  list(@CurrentMembership() m: ActiveMembership, @Query('onlyMovement') onlyMovement?: string) {
    return this.prisma.glAccount.findMany({
      where: {
        organizationId: m.organizationId,
        ...(onlyMovement === 'true' && { acceptsMovement: true, status: 'ACTIVE' }),
      },
      orderBy: { code: 'asc' },
      select: {
        id: true,
        code: true,
        name: true,
        nature: true,
        level: true,
        acceptsMovement: true,
        status: true,
      },
    });
  }

  private async assertParent(organizationId: string, code: string) {
    const parent = pucParent(code);
    if (
      parent &&
      !(await this.prisma.glAccount.findUnique({
        where: { organizationId_code: { organizationId, code: parent } },
      }))
    ) {
      throw Errors.badRequest('PUC_PARENT_MISSING', `Primero cree la cuenta padre ${parent}.`);
    }
  }

  @Post('chart-of-accounts')
  @Org('master_data.manage')
  async create(
    @CurrentUser() user: AuthUser,
    @CurrentMembership() m: ActiveMembership,
    @Body(new ZodPipe(UpsertGlAccountRequest)) body: GlBody,
  ) {
    let level: number;
    try {
      level = pucLevel(body.code);
    } catch (err) {
      throw Errors.badRequest('PUC_CODE_INVALID', (err as Error).message);
    }
    await this.assertParent(m.organizationId, body.code);
    if (
      await this.prisma.glAccount.findUnique({
        where: { organizationId_code: { organizationId: m.organizationId, code: body.code } },
      })
    ) {
      throw Errors.conflict('PUC_CODE_EXISTS', `La cuenta ${body.code} ya existe.`);
    }
    const row = await this.prisma.glAccount.create({
      data: {
        organizationId: m.organizationId,
        code: body.code,
        name: body.name,
        nature: body.nature ?? defaultNature(body.code),
        level,
        acceptsMovement: body.acceptsMovement ?? level >= 4,
        status: body.status ?? 'ACTIVE',
        createdBy: user.id,
      },
    });
    await this.audit.record({
      action: 'GL_ACCOUNT_CREATED',
      entity: 'gl_account',
      entityId: row.id,
      after: row,
    });
    return row;
  }

  @Patch('chart-of-accounts/:id')
  @Org('master_data.manage')
  async update(
    @CurrentMembership() m: ActiveMembership,
    @Param('id', ParseUUIDPipe) id: string,
    @Body(new ZodPipe(UpsertGlAccountRequest.partial())) body: Partial<GlBody>,
  ) {
    const before = await this.prisma.glAccount.findFirst({
      where: { id, organizationId: m.organizationId },
      include: { _count: { select: { bankAccounts: true, feeMappings: true } } },
    });
    if (!before) throw Errors.notFound('La cuenta contable');
    if (body.code && body.code !== before.code)
      throw Errors.badRequest('PUC_CODE_IMMUTABLE', 'El código de una cuenta no se puede cambiar.');
    const inUse = before._count.bankAccounts + before._count.feeMappings > 0;
    if (inUse && (body.acceptsMovement === false || body.status === 'INACTIVE')) {
      throw Errors.conflict(
        'GL_ACCOUNT_IN_USE',
        'La cuenta está asociada a cuentas bancarias o al mapeo de notas; no se puede desactivar.',
      );
    }
    const { _count, ...prev } = before;
    void _count;
    const after = await this.prisma.glAccount.update({
      where: { id },
      data: {
        ...(body.name && { name: body.name }),
        ...(body.nature && { nature: body.nature }),
        ...(body.acceptsMovement !== undefined && { acceptsMovement: body.acceptsMovement }),
        ...(body.status && { status: body.status }),
      },
    });
    await this.audit.record({
      action: 'GL_ACCOUNT_UPDATED',
      entity: 'gl_account',
      entityId: id,
      before: prev,
      after,
    });
    return after;
  }

  /** PUC base de referencia, solo si la organización aún no tiene plan de cuentas. */
  @Post('chart-of-accounts/load-base')
  @Org('master_data.manage')
  @HttpCode(201)
  async loadBase(@CurrentUser() user: AuthUser, @CurrentMembership() m: ActiveMembership) {
    if (await this.prisma.glAccount.count({ where: { organizationId: m.organizationId } })) {
      throw Errors.conflict(
        'PUC_NOT_EMPTY',
        'La organización ya tiene plan de cuentas. Use la importación para completarlo.',
      );
    }
    const data = PUC_BASE.map(({ code, name }) => {
      const level = pucLevel(code);
      return {
        organizationId: m.organizationId,
        code,
        name,
        level,
        nature: defaultNature(code),
        acceptsMovement: level >= 4,
        createdBy: user.id,
      };
    });
    await this.prisma.glAccount.createMany({ data });
    await this.audit.record({
      action: 'PUC_BASE_LOADED',
      entity: 'chart_of_accounts',
      after: { accounts: data.length },
    });
    return { created: data.length };
  }

  /**
   * Importa (crea o actualiza por código) desde XLSX/XLS/CSV. Todo o nada: con cualquier error no se guarda nada.
   * ?dryRun=true solo devuelve la vista previa.
   */
  @Post('chart-of-accounts/import')
  @Org('master_data.manage')
  @HttpCode(200)
  @UseInterceptors(FileInterceptor('file', { limits: { fileSize: MAX_FILE_BYTES, files: 1 } }))
  async import(
    @CurrentUser() user: AuthUser,
    @CurrentMembership() m: ActiveMembership,
    @UploadedFile() file: { buffer: Buffer; originalname: string } | undefined,
    @Query('dryRun') dryRun?: string,
  ) {
    if (!file) throw Errors.badRequest('FILE_REQUIRED', 'Adjunte un archivo XLSX, XLS o CSV.');
    if (!detectKind(file.buffer, file.originalname)) {
      throw Errors.badRequest('FILE_TYPE_INVALID', 'Formato no admitido. Use XLSX, XLS o CSV.');
    }

    let parsed;
    try {
      parsed = parsePucFile(file.buffer);
    } catch {
      throw Errors.badRequest(
        'FILE_UNREADABLE',
        'No se pudo leer el archivo. Verifique que no esté dañado ni protegido.',
      );
    }
    const existing = await this.prisma.glAccount.findMany({
      where: { organizationId: m.organizationId },
    });
    const byCode = new Map(existing.map((a) => [a.code, a]));
    const errors = [
      ...parsed.errors,
      ...missingParents(parsed.rows, new Set(byCode.keys())).map((p) => ({
        row: 0,
        message: `La cuenta ${p.code} no tiene cuenta padre ${p.parent} (ni en el archivo ni en el plan actual).`,
      })),
    ];

    const toCreate = parsed.rows.filter((r) => !byCode.has(r.code));
    const toUpdate = parsed.rows.filter((r) => {
      const e = byCode.get(r.code);
      return (
        e && (e.name !== r.name || e.nature !== r.nature || e.acceptsMovement !== r.acceptsMovement)
      );
    });
    const summary = {
      fileName: file.originalname,
      totalRows: parsed.rows.length,
      toCreate: toCreate.length,
      toUpdate: toUpdate.length,
      unchanged: parsed.rows.length - toCreate.length - toUpdate.length,
      errors: errors.slice(0, 200),
      errorCount: errors.length,
      sample: parsed.rows.slice(0, 20),
    };
    if (dryRun === 'true') return { ...summary, applied: false };
    if (errors.length)
      throw Errors.badRequest(
        'PUC_IMPORT_INVALID',
        `El archivo tiene ${errors.length} errores; no se importó nada.`,
        summary,
      );
    if (!parsed.rows.length)
      throw Errors.badRequest('PUC_IMPORT_EMPTY', 'El archivo no tiene cuentas.');

    await this.prisma.$transaction(async (tx) => {
      if (toCreate.length) {
        await tx.glAccount.createMany({
          data: toCreate.map((r) => ({
            ...r,
            organizationId: m.organizationId,
            createdBy: user.id,
          })),
        });
      }
      for (const r of toUpdate) {
        await tx.glAccount.update({
          where: { organizationId_code: { organizationId: m.organizationId, code: r.code } },
          data: { name: r.name, nature: r.nature, acceptsMovement: r.acceptsMovement },
        });
      }
      await this.audit.record(
        {
          action: 'PUC_IMPORTED',
          entity: 'chart_of_accounts',
          after: {
            fileName: file.originalname,
            created: toCreate.length,
            updated: toUpdate.length,
          },
        },
        tx,
      );
    });
    return { ...summary, applied: true };
  }

  // ---------- Mapeo de notas bancarias ----------

  @Get('fee-mappings')
  @Org()
  async feeMappings(@CurrentMembership() m: ActiveMembership) {
    const rows = await this.prisma.feeTypeAccountMapping.findMany({
      where: { organizationId: m.organizationId },
      include: { glAccount: { select: { id: true, code: true, name: true } } },
    });
    const byType = new Map(rows.map((r) => [r.feeType, r.glAccount]));
    return (Object.keys(FEE_TYPES) as FeeType[]).map((feeType) => ({
      feeType,
      label: FEE_TYPES[feeType].label,
      side: FEE_TYPES[feeType].side,
      suggestedCode: FEE_TYPES[feeType].suggested,
      glAccount: byType.get(feeType) ?? null,
    }));
  }

  @Put('fee-mappings')
  @Org('master_data.manage')
  async upsertFeeMapping(
    @CurrentUser() user: AuthUser,
    @CurrentMembership() m: ActiveMembership,
    @Body(new ZodPipe(UpsertFeeMappingRequest)) body: z.infer<typeof UpsertFeeMappingRequest>,
  ) {
    const gl = await this.prisma.glAccount.findFirst({
      where: { id: body.glAccountId, organizationId: m.organizationId },
    });
    if (!gl) throw Errors.notFound('La cuenta contable');
    if (!gl.acceptsMovement || gl.status !== 'ACTIVE') {
      throw Errors.badRequest(
        'GL_ACCOUNT_NOT_POSTABLE',
        'La cuenta contable debe estar activa y aceptar movimiento.',
      );
    }
    const where = {
      organizationId_feeType: { organizationId: m.organizationId, feeType: body.feeType },
    };
    const before = await this.prisma.feeTypeAccountMapping.findUnique({ where });
    const row = await this.prisma.feeTypeAccountMapping.upsert({
      where,
      create: {
        organizationId: m.organizationId,
        feeType: body.feeType,
        glAccountId: gl.id,
        createdBy: user.id,
      },
      update: { glAccountId: gl.id },
    });
    await this.audit.record({
      action: 'FEE_MAPPING_UPDATED',
      entity: 'fee_mapping',
      entityId: row.id,
      before: before && { feeType: before.feeType, glAccountId: before.glAccountId },
      after: { feeType: body.feeType, glAccountId: gl.id, glCode: gl.code },
    });
    return row;
  }

  /** Aplica los códigos sugeridos que existan en el PUC, solo para tipos aún sin mapear. */
  @Post('fee-mappings/apply-suggested')
  @Org('master_data.manage')
  @HttpCode(200)
  async applySuggested(@CurrentUser() user: AuthUser, @CurrentMembership() m: ActiveMembership) {
    const mapped = new Set(
      (
        await this.prisma.feeTypeAccountMapping.findMany({
          where: { organizationId: m.organizationId },
          select: { feeType: true },
        })
      ).map((r) => r.feeType),
    );
    const accounts = await this.prisma.glAccount.findMany({
      where: {
        organizationId: m.organizationId,
        code: { in: Object.values(FEE_TYPES).map((f) => f.suggested) },
        acceptsMovement: true,
        status: 'ACTIVE',
      },
    });
    const byCode = new Map(accounts.map((a) => [a.code, a.id]));
    const data = (Object.keys(FEE_TYPES) as FeeType[])
      .filter((t) => !mapped.has(t) && byCode.has(FEE_TYPES[t].suggested))
      .map((feeType) => ({
        organizationId: m.organizationId,
        feeType,
        glAccountId: byCode.get(FEE_TYPES[feeType].suggested)!,
        createdBy: user.id,
      }));
    if (data.length) await this.prisma.feeTypeAccountMapping.createMany({ data });
    await this.audit.record({
      action: 'FEE_MAPPING_SUGGESTED_APPLIED',
      entity: 'fee_mapping',
      after: { applied: data.map((d) => d.feeType) },
    });
    return { applied: data.length };
  }
}
