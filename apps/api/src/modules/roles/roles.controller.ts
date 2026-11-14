import { Body, Controller, Get, Param, ParseUUIDPipe, Patch, Post } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { PERMISSIONS, UpsertRoleRequest } from '@finagent/contracts';
import type { z } from 'zod';
import { Errors } from '../../common/errors.js';
import { ZodPipe } from '../../common/zod.pipe.js';
import { PrismaService } from '../../infrastructure/prisma.service.js';
import { AuditService } from '../audit/audit.service.js';
import { type ActiveMembership, CurrentMembership, Org } from '../auth/decorators.js';
import { assertCanGrant } from './rbac.helpers.js';

type RoleBody = z.infer<typeof UpsertRoleRequest>;

const roleSelect = {
  id: true,
  key: true,
  name: true,
  description: true,
  isSystem: true,
  permissions: { select: { permissionKey: true } },
  _count: { select: { members: true } },
} as const;

@ApiTags('roles')
@Controller()
export class RolesController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  @Get('permissions')
  @Org()
  permissions() {
    return Object.entries(PERMISSIONS).map(([key, description]) => ({ key, description }));
  }

  /** Roles de sistema + roles propios de la organización activa. */
  @Get('roles')
  @Org('users.read')
  async list(@CurrentMembership() m: ActiveMembership) {
    const roles = await this.prisma.role.findMany({
      where: { OR: [{ organizationId: null }, { organizationId: m.organizationId }] },
      orderBy: [{ isSystem: 'desc' }, { name: 'asc' }],
      select: roleSelect,
    });
    return roles.map(({ permissions, _count, ...r }) => ({
      ...r,
      permissions: permissions.map((p) => p.permissionKey),
      memberCount: _count.members,
    }));
  }

  @Post('roles')
  @Org('roles.manage')
  async create(
    @CurrentMembership() m: ActiveMembership,
    @Body(new ZodPipe(UpsertRoleRequest)) body: RoleBody,
  ) {
    assertCanGrant(m, body.permissions);
    const slug = body.name
      .normalize('NFD')
      .replace(/\p{Diacritic}/gu, '')
      .replace(/[^A-Za-z0-9]+/g, '_');
    const key = `CUSTOM_${slug.toUpperCase().slice(0, 40)}`;
    const exists = await this.prisma.role.findFirst({
      where: { organizationId: m.organizationId, key },
    });
    if (exists) throw Errors.conflict('ROLE_EXISTS', 'Ya existe un rol con ese nombre.');

    const role = await this.prisma.role.create({
      data: {
        organizationId: m.organizationId,
        key,
        name: body.name,
        description: body.description ?? null,
        permissions: { create: body.permissions.map((permissionKey) => ({ permissionKey })) },
      },
      select: roleSelect,
    });
    await this.audit.record({
      action: 'ROLE_CREATED',
      entity: 'role',
      entityId: role.id,
      after: body,
    });
    return role;
  }

  @Patch('roles/:id')
  @Org('roles.manage')
  async update(
    @CurrentMembership() m: ActiveMembership,
    @Param('id', ParseUUIDPipe) id: string,
    @Body(new ZodPipe(UpsertRoleRequest)) body: RoleBody,
  ) {
    const role = await this.prisma.role.findFirst({
      where: { id, organizationId: m.organizationId },
      select: roleSelect,
    });
    if (!role) throw Errors.notFound('El rol');
    if (role.isSystem) throw Errors.forbidden('Los roles de sistema no se pueden modificar.');
    if (m.roleId === id)
      throw Errors.forbidden('No puede modificar el rol que usted mismo tiene asignado.');
    assertCanGrant(m, body.permissions);

    const updated = await this.prisma.$transaction(async (tx) => {
      await tx.rolePermission.deleteMany({ where: { roleId: id } });
      return tx.role.update({
        where: { id },
        data: {
          name: body.name,
          description: body.description ?? null,
          permissions: { create: body.permissions.map((permissionKey) => ({ permissionKey })) },
        },
        select: roleSelect,
      });
    });
    await this.audit.record({
      action: 'ROLE_UPDATED',
      entity: 'role',
      entityId: id,
      before: { name: role.name, permissions: role.permissions.map((p) => p.permissionKey) },
      after: body,
    });
    return updated;
  }
}
