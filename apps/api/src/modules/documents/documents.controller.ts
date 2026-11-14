import {
  Body,
  Controller,
  Get,
  Headers,
  HttpCode,
  Param,
  ParseUUIDPipe,
  Post,
  Query,
  Res,
  StreamableFile,
  UploadedFile,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { ApiTags } from '@nestjs/swagger';
import { ImportRequest, PreviewRequest, UploadDocumentFields } from '@finagent/contracts';
import { readGrid, type TemplateConfig } from '@finagent/parsers';
import type { Response } from 'express';
import { z } from 'zod';
import { Errors } from '../../common/errors.js';
import { ctx } from '../../common/request-context.js';
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
import { accessibleAccounts, assertAccountAccess } from '../master-data/account-access.js';
import { DocumentsService, MAX_UPLOAD_BYTES } from './documents.service.js';
import { ImportsQueue } from './imports.queue.js';

const ListQuery = z.object({
  side: z.enum(['BANK', 'BOOK']).optional(),
  bankAccountId: z.uuid().optional(),
  year: z.coerce.number().int().optional(),
  month: z.coerce.number().int().min(1).max(12).optional(),
});

const documentSelect = {
  id: true,
  side: true,
  fileName: true,
  format: true,
  sizeBytes: true,
  sha256: true,
  status: true,
  createdAt: true,
  uploadedBy: true,
  bankAccount: {
    select: {
      id: true,
      name: true,
      accountLast4: true,
      currency: true,
      bank: { select: { name: true } },
    },
  },
  period: { select: { year: true, month: true } },
  imports: {
    orderBy: { createdAt: 'desc' as const },
    take: 1,
    select: {
      id: true,
      status: true,
      importedCount: true,
      errorCount: true,
      duplicateCount: true,
      balanced: true,
    },
  },
} as const;

@ApiTags('documents')
@Controller()
export class DocumentsController {
  constructor(
    private readonly docs: DocumentsService,
    private readonly prisma: PrismaService,
    private readonly queue: ImportsQueue,
    private readonly audit: AuditService,
  ) {}

  @Post('documents/upload')
  @Org('documents.import')
  @UseInterceptors(FileInterceptor('file', { limits: { fileSize: MAX_UPLOAD_BYTES, files: 1 } }))
  async upload(
    @CurrentUser() user: AuthUser,
    @CurrentMembership() m: ActiveMembership,
    @UploadedFile() file: { buffer: Buffer; originalname: string } | undefined,
    @Body(new ZodPipe(UploadDocumentFields)) body: z.infer<typeof UploadDocumentFields>,
  ) {
    if (!file) throw Errors.badRequest('FILE_REQUIRED', 'Adjunte el archivo.');
    assertAccountAccess(m, body.bankAccountId);
    // multer entrega el nombre en latin1; se corrige a UTF-8 para conservar tildes.
    const fileName = Buffer.from(file.originalname, 'latin1').toString('utf8');
    return this.docs.upload({
      organizationId: m.organizationId,
      userId: user.id,
      fileName,
      buffer: file.buffer,
      ...body,
    });
  }

  @Get('documents')
  @Org('reconciliations.read')
  list(
    @CurrentMembership() m: ActiveMembership,
    @Query(new ZodPipe(ListQuery)) q: z.infer<typeof ListQuery>,
  ) {
    return this.prisma.document.findMany({
      where: {
        organizationId: m.organizationId,
        bankAccount: accessibleAccounts(m),
        ...(q.side && { side: q.side }),
        ...(q.bankAccountId && { bankAccountId: q.bankAccountId }),
        ...((q.year || q.month) && {
          period: { ...(q.year && { year: q.year }), ...(q.month && { month: q.month }) },
        }),
      },
      orderBy: { createdAt: 'desc' },
      take: 500,
      select: documentSelect,
    });
  }

  private async load(m: ActiveMembership, id: string) {
    const doc = await this.docs.loadForOrg(m.organizationId, id);
    assertAccountAccess(m, doc.bankAccountId);
    return doc;
  }

  @Get('documents/:id')
  @Org('reconciliations.read')
  async get(@CurrentMembership() m: ActiveMembership, @Param('id', ParseUUIDPipe) id: string) {
    await this.load(m, id);
    const doc = await this.prisma.document.findUniqueOrThrow({
      where: { id },
      select: { ...documentSelect, imports: { orderBy: { createdAt: 'desc' } } },
    });
    return { ...doc, imports: doc.imports.map((i) => this.docs.presentImport(i)) };
  }

  /** Primeras filas en crudo para el mapeador visual de columnas. */
  @Get('documents/:id/grid')
  @Org('documents.import')
  async grid(@CurrentMembership() m: ActiveMembership, @Param('id', ParseUUIDPipe) id: string) {
    const doc = await this.load(m, id);
    if (!['CSV', 'XLSX', 'XLS'].includes(doc.format)) {
      throw Errors.badRequest(
        'GRID_NOT_APPLICABLE',
        'Este formato es estándar y no requiere plantilla.',
      );
    }
    const { sheets, encoding, delimiter } = readGrid(
      await this.docs.file(doc),
      doc.format as 'CSV' | 'XLSX' | 'XLS',
    );
    return {
      encoding: encoding ?? null,
      delimiter: delimiter ?? null,
      sheets: sheets.map((s) => ({
        name: s.name,
        totalRows: s.rows.length,
        rows: s.rows.slice(0, 40),
      })),
    };
  }

  @Post('documents/:id/preview')
  @Org('documents.import')
  @HttpCode(200)
  async preview(
    @CurrentMembership() m: ActiveMembership,
    @Param('id', ParseUUIDPipe) id: string,
    @Body(new ZodPipe(PreviewRequest)) body: z.infer<typeof PreviewRequest>,
  ) {
    const doc = await this.load(m, id);
    const resolved = body.templateConfig
      ? null
      : await this.docs.resolveTemplate(m.organizationId, doc.side, body.templateId);
    const template =
      (body.templateConfig as TemplateConfig | undefined) ?? resolved?.config ?? null;
    const { processed, analysis } = await this.docs.run(doc, template, {
      opening: body.openingBalance,
      closing: body.closingBalance,
    });
    return this.docs.summarize(processed, analysis);
  }

  /** Confirma la importación (asíncrona en el worker). Exige Idempotency-Key. */
  @Post('documents/:id/import')
  @Org('documents.import')
  @HttpCode(202)
  async import(
    @CurrentUser() user: AuthUser,
    @CurrentMembership() m: ActiveMembership,
    @Param('id', ParseUUIDPipe) id: string,
    @Headers('idempotency-key') idempotencyKey: string | undefined,
    @Body(new ZodPipe(ImportRequest)) body: z.infer<typeof ImportRequest>,
  ) {
    if (!idempotencyKey || !/^[\w-]{8,100}$/.test(idempotencyKey)) {
      throw Errors.badRequest('IDEMPOTENCY_KEY_REQUIRED', 'Falta la cabecera Idempotency-Key.');
    }
    const doc = await this.load(m, id);
    const prior = await this.prisma.documentImport.findUnique({ where: { idempotencyKey } });
    if (prior) {
      if (prior.documentId !== doc.id)
        throw Errors.conflict(
          'IDEMPOTENCY_KEY_REUSED',
          'La clave de idempotencia ya se usó para otro documento.',
        );
      return { importId: prior.id, status: prior.status };
    }
    const active = await this.prisma.documentImport.findFirst({
      where: { documentId: doc.id, status: { in: ['QUEUED', 'PROCESSING', 'COMPLETED'] } },
    });
    if (active)
      throw Errors.conflict(
        'ALREADY_IMPORTED',
        'Este documento ya fue importado o se está importando.',
      );

    const template = await this.docs.resolveTemplate(m.organizationId, doc.side, body.templateId);
    // Validación previa en la API: errores evidentes se informan sin encolar.
    const { analysis } = await this.docs.run(doc, template?.config ?? null, {
      opening: body.openingBalance,
      closing: body.closingBalance,
    });
    const blocking = analysis.warnings.filter((w) => w.blocking);
    if (blocking.length)
      throw Errors.badRequest('IMPORT_BLOCKED', blocking.map((w) => w.message).join(' '), {
        warnings: analysis.warnings,
      });
    if (analysis.requiresJustification && !body.justification) {
      throw Errors.badRequest(
        'JUSTIFICATION_REQUIRED',
        'Los saldos no cuadran: para continuar escriba una justificación (queda en auditoría).',
        { warnings: analysis.warnings },
      );
    }

    const imp = await this.prisma.documentImport.create({
      data: {
        documentId: doc.id,
        templateVersionId: template?.versionId ?? null,
        idempotencyKey,
        openingBalance: body.openingBalance ?? null,
        closingBalance: body.closingBalance ?? null,
        justification: analysis.requiresJustification ? body.justification : null,
        createdBy: user.id,
      },
    });
    await this.prisma.document.update({ where: { id: doc.id }, data: { status: 'IMPORTING' } });
    await this.audit.record({
      action: 'DOCUMENT_IMPORT_REQUESTED',
      entity: 'document',
      entityId: doc.id,
      after: { importId: imp.id, templateVersion: template?.version ?? null },
      reason: imp.justification ?? undefined,
    });
    await this.queue.enqueue({
      importId: imp.id,
      organizationId: m.organizationId,
      userId: user.id,
      correlationId: ctx().correlationId,
    });
    return { importId: imp.id, status: imp.status };
  }

  @Get('document-imports/:id')
  @Org('reconciliations.read')
  async importStatus(
    @CurrentMembership() m: ActiveMembership,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    const imp = await this.prisma.documentImport.findFirst({
      where: { id, document: { organizationId: m.organizationId } },
      include: { document: { select: { bankAccountId: true, fileName: true } } },
    });
    if (!imp) throw Errors.notFound('La importación');
    assertAccountAccess(m, imp.document.bankAccountId);
    return this.docs.presentImport(imp);
  }

  @Get('document-imports')
  @Org('reconciliations.read')
  async imports(@CurrentMembership() m: ActiveMembership) {
    const rows = await this.prisma.documentImport.findMany({
      where: { document: { organizationId: m.organizationId, bankAccount: accessibleAccounts(m) } },
      orderBy: { createdAt: 'desc' },
      take: 200,
      include: {
        document: {
          select: {
            id: true,
            fileName: true,
            side: true,
            format: true,
            period: { select: { year: true, month: true } },
            bankAccount: {
              select: { name: true, accountLast4: true, bank: { select: { name: true } } },
            },
          },
        },
        templateVersion: { select: { version: true, template: { select: { name: true } } } },
      },
    });
    return rows.map((r) => this.docs.presentImport(r));
  }

  /** Descarga del original (inmutable). Queda en auditoría. */
  @Get('documents/:id/download')
  @Org('reconciliations.read')
  async download(
    @CurrentMembership() m: ActiveMembership,
    @Param('id', ParseUUIDPipe) id: string,
    @Res({ passthrough: true }) res: Response,
  ) {
    const doc = await this.load(m, id);
    const buf = await this.docs.file(doc);
    await this.audit.record({
      action: 'DOCUMENT_DOWNLOADED',
      entity: 'document',
      entityId: doc.id,
    });
    res.setHeader(
      'Content-Disposition',
      `attachment; filename*=UTF-8''${encodeURIComponent(doc.fileName)}`,
    );
    res.setHeader('Content-Type', 'application/octet-stream');
    return new StreamableFile(buf);
  }
}
