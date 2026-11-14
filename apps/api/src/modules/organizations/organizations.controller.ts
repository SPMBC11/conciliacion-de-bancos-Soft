import { Body, Controller, Get, Patch, Post } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { CreateOrganizationRequest } from '@finagent/contracts';
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

const UpdateOrganization = z.object({ legalName: z.string().trim().min(3).max(200) });
const orgSelect = {
  id: true,
  nit: true,
  legalName: true,
  functionalCurrency: true,
  status: true,
  createdAt: true,
} as const;

@ApiTags('organizations')
@Controller('organizations')
export class OrganizationsController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  /** Organizaciones donde el usuario es miembro activo. */
  @Get()
  list(@CurrentUser() user: AuthUser) {
    return this.prisma.organization.findMany({
      where: { members: { some: { userId: user.id, status: 'ACTIVE' } } },
      orderBy: { legalName: 'asc' },
      select: orgSelect,
    });
  }

  /** Quien crea una organización queda como Propietario. */
  @Post()
  async create(
    @CurrentUser() user: AuthUser,
    @Body(new ZodPipe(CreateOrganizationRequest)) body: z.infer<typeof CreateOrganizationRequest>,
  ) {
    const nit = body.nit;
    if (await this.prisma.organization.findUnique({ where: { nit } })) {
      throw Errors.conflict('ORGANIZATION_EXISTS', 'Ya existe una organización con ese NIT.');
    }
    const owner = await this.prisma.role.findFirstOrThrow({
      where: { key: 'OWNER', organizationId: null },
    });
    const org = await this.prisma.$transaction(async (tx) => {
      const created = await tx.organization.create({
        data: {
          nit,
          legalName: body.legalName,
          functionalCurrency: body.functionalCurrency,
          createdBy: user.id,
        },
        select: orgSelect,
      });
      await tx.organizationMember.create({
        data: { organizationId: created.id, userId: user.id, roleId: owner.id, createdBy: user.id },
      });
      await this.audit.record(
        {
          action: 'ORGANIZATION_CREATED',
          entity: 'organization',
          entityId: created.id,
          after: created,
          organizationId: created.id,
        },
        tx,
      );
      return created;
    });
    return org;
  }

  @Get('current')
  @Org()
  current(@CurrentMembership() m: ActiveMembership) {
    return this.prisma.organization.findUniqueOrThrow({
      where: { id: m.organizationId },
      select: orgSelect,
    });
  }

  @Patch('current')
  @Org('organization.manage')
  async update(
    @CurrentMembership() m: ActiveMembership,
    @Body(new ZodPipe(UpdateOrganization)) body: z.infer<typeof UpdateOrganization>,
  ) {
    const before = await this.prisma.organization.findUniqueOrThrow({
      where: { id: m.organizationId },
      select: orgSelect,
    });
    const after = await this.prisma.organization.update({
      where: { id: m.organizationId },
      data: body,
      select: orgSelect,
    });
    await this.audit.record({
      action: 'ORGANIZATION_UPDATED',
      entity: 'organization',
      entityId: m.organizationId,
      before,
      after,
    });
    return after;
  }
}
