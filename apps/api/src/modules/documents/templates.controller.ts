import { Body, Controller, Get, Param, ParseUUIDPipe, Patch, Post, Query } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { CreateTemplateRequest, UpdateTemplateRequest } from '@finagent/contracts';
import { headerSignature, readGrid, type TemplateConfig } from '@finagent/parsers';
import { z } from 'zod';
import { Errors } from '../../common/errors.js';
import { ZodPipe } from '../../common/zod.pipe.js';
import type { Prisma } from '../../generated/prisma/client.js';
import { PrismaService } from '../../infrastructure/prisma.service.js';
import { AuditService } from '../audit/audit.service.js';
import {
  type ActiveMembership,
  type AuthUser,
  CurrentMembership,
  CurrentUser,
  Org,
} from '../auth/decorators.js';
import { assertAccountAccess } from '../master-data/account-access.js';
import { DocumentsService } from './documents.service.js';

const select = {
  id: true,
  name: true,
  side: true,
  format: true,
  software: true,
  currentVersion: true,
  headerSignature: true,
  status: true,
  updatedAt: true,
  bank: { select: { id: true, name: true } },
  versions: {
    orderBy: { version: 'desc' as const },
    take: 1,
    select: { version: true, config: true, createdAt: true },
  },
} as const;

@ApiTags('import-templates')
@Controller('import-templates')
export class TemplatesController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly docs: DocumentsService,
    private readonly audit: AuditService,
  ) {}

  @Get()
  @Org()
  list(@CurrentMembership() m: ActiveMembership, @Query('side') side?: 'BANK' | 'BOOK') {
    return this.prisma.importTemplate.findMany({
      where: { organizationId: m.organizationId, ...(side && { side }) },
      orderBy: { name: 'asc' },
      select,
    });
  }

  @Get(':id')
  @Org()
  async get(@CurrentMembership() m: ActiveMembership, @Param('id', ParseUUIDPipe) id: string) {
    const t = await this.prisma.importTemplate.findFirst({
      where: { id, organizationId: m.organizationId },
      select: {
        ...select,
        versions: {
          orderBy: { version: 'desc' },
          select: { version: true, config: true, createdAt: true, createdBy: true },
        },
      },
    });
    if (!t) throw Errors.notFound('La plantilla');
    return t;
  }

  /** Firma del encabezado tomada del archivo de muestra (fila de encabezado de la plantilla). */
  private async signatureFrom(
    m: ActiveMembership,
    documentId: string | undefined,
    config: TemplateConfig,
  ) {
    if (!documentId || config.headerRow === null) return null;
    const doc = await this.docs.loadForOrg(m.organizationId, documentId);
    assertAccountAccess(m, doc.bankAccountId);
    if (!['CSV', 'XLSX', 'XLS'].includes(doc.format)) return null;
    const sheet = readGrid(await this.docs.file(doc), doc.format as 'CSV').sheets[
      config.sheetIndex
    ];
    const sig = sheet?.rows[config.headerRow - 1]
      ? headerSignature(sheet.rows[config.headerRow - 1]!)
      : '';
    return sig || null;
  }

  @Post()
  @Org('documents.import')
  async create(
    @CurrentUser() user: AuthUser,
    @CurrentMembership() m: ActiveMembership,
    @Body(new ZodPipe(CreateTemplateRequest)) body: z.output<typeof CreateTemplateRequest>,
  ) {
    if (
      await this.prisma.importTemplate.findUnique({
        where: { organizationId_name: { organizationId: m.organizationId, name: body.name } },
      })
    ) {
      throw Errors.conflict('TEMPLATE_EXISTS', 'Ya existe una plantilla con ese nombre.');
    }
    const config = body.config as TemplateConfig;
    const signature = await this.signatureFrom(m, body.sampleDocumentId, config);
    const t = await this.prisma.importTemplate.create({
      data: {
        organizationId: m.organizationId,
        name: body.name,
        side: body.side,
        bankId: body.bankId ?? null,
        software: body.software ?? null,
        format: body.format,
        headerSignature: signature,
        createdBy: user.id,
        versions: {
          create: {
            version: 1,
            config: config as Prisma.InputJsonValue,
            headerSignature: signature,
            createdBy: user.id,
          },
        },
      },
      select,
    });
    await this.audit.record({
      action: 'TEMPLATE_CREATED',
      entity: 'import_template',
      entityId: t.id,
      after: { name: body.name, side: body.side, config },
    });
    return t;
  }

  /** Cambiar la configuración crea una versión nueva; las importaciones anteriores conservan la suya. */
  @Patch(':id')
  @Org('documents.import')
  async update(
    @CurrentUser() user: AuthUser,
    @CurrentMembership() m: ActiveMembership,
    @Param('id', ParseUUIDPipe) id: string,
    @Body(new ZodPipe(UpdateTemplateRequest)) body: z.output<typeof UpdateTemplateRequest>,
  ) {
    const t = await this.prisma.importTemplate.findFirst({
      where: { id, organizationId: m.organizationId },
      include: { versions: { orderBy: { version: 'desc' }, take: 1 } },
    });
    if (!t) throw Errors.notFound('La plantilla');
    const config = body.config as TemplateConfig | undefined;
    const signature = config
      ? ((await this.signatureFrom(m, body.sampleDocumentId, config)) ?? t.headerSignature)
      : t.headerSignature;
    const next = t.currentVersion + 1;
    const updated = await this.prisma.importTemplate.update({
      where: { id },
      data: {
        ...(body.name && { name: body.name }),
        ...(body.status && { status: body.status }),
        ...(config && {
          currentVersion: next,
          headerSignature: signature,
          versions: {
            create: {
              version: next,
              config: config as Prisma.InputJsonValue,
              headerSignature: signature,
              createdBy: user.id,
            },
          },
        }),
      },
      select,
    });
    await this.audit.record({
      action: 'TEMPLATE_UPDATED',
      entity: 'import_template',
      entityId: id,
      before: {
        name: t.name,
        status: t.status,
        version: t.currentVersion,
        config: t.versions[0]?.config,
      },
      after: {
        name: updated.name,
        status: updated.status,
        version: updated.currentVersion,
        ...(config && { config }),
      },
    });
    return updated;
  }
}
