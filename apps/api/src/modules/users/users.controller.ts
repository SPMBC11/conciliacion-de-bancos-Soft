import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Put,
} from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import {
  InviteUserRequest,
  MemberAccountScopeRequest,
  UpdateMemberRequest,
} from '@finagent/contracts';
import type { z } from 'zod';
import { config } from '../../config.js';
import { Errors } from '../../common/errors.js';
import { ZodPipe } from '../../common/zod.pipe.js';
import { MailService } from '../../infrastructure/mail.service.js';
import { PrismaService } from '../../infrastructure/prisma.service.js';
import { AuditService } from '../audit/audit.service.js';
import {
  type ActiveMembership,
  type AuthUser,
  CurrentMembership,
  CurrentUser,
  Org,
} from '../auth/decorators.js';
import { INVITATION_TTL_MS, randomToken, sha256 } from '../auth/tokens.js';
import { assertCanAssignRole } from '../roles/rbac.helpers.js';

@ApiTags('users')
@Controller('users')
export class UsersController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly mail: MailService,
  ) {}

  /** Miembros e invitaciones pendientes de la organización activa. */
  @Get()
  @Org('users.read')
  async list(@CurrentMembership() m: ActiveMembership) {
    const [members, invitations] = await Promise.all([
      this.prisma.organizationMember.findMany({
        where: { organizationId: m.organizationId },
        orderBy: { user: { fullName: 'asc' } },
        select: {
          id: true,
          status: true,
          accountScope: true,
          bankAccounts: { select: { bankAccountId: true } },
          createdAt: true,
          user: { select: { id: true, email: true, fullName: true, lastLoginAt: true } },
          role: { select: { id: true, key: true, name: true } },
        },
      }),
      this.prisma.invitation.findMany({
        where: {
          organizationId: m.organizationId,
          acceptedAt: null,
          revokedAt: null,
          expiresAt: { gt: new Date() },
        },
        orderBy: { createdAt: 'desc' },
        select: {
          id: true,
          email: true,
          expiresAt: true,
          createdAt: true,
          role: { select: { id: true, name: true } },
        },
      }),
    ]);
    return { members, invitations };
  }

  private async loadAssignableRole(m: ActiveMembership, roleId: string) {
    const role = await this.prisma.role.findFirst({
      where: { id: roleId, OR: [{ organizationId: null }, { organizationId: m.organizationId }] },
      select: {
        id: true,
        key: true,
        name: true,
        isSystem: true,
        permissions: { select: { permissionKey: true } },
      },
    });
    if (!role) throw Errors.notFound('El rol');
    assertCanAssignRole(
      m,
      role,
      role.permissions.map((p) => p.permissionKey),
    );
    return role;
  }

  @Post('invitations')
  @Org('users.manage')
  @Throttle({ default: { limit: config.AUTH_RATE_LIMIT, ttl: 60_000 } })
  async invite(
    @CurrentUser() user: AuthUser,
    @CurrentMembership() m: ActiveMembership,
    @Body(new ZodPipe(InviteUserRequest)) body: z.infer<typeof InviteUserRequest>,
  ) {
    const role = await this.loadAssignableRole(m, body.roleId);
    const activeMember = await this.prisma.organizationMember.findFirst({
      where: { organizationId: m.organizationId, user: { email: body.email }, status: 'ACTIVE' },
    });
    if (activeMember)
      throw Errors.conflict('ALREADY_MEMBER', 'Ese correo ya pertenece a la organización.');

    const org = await this.prisma.organization.findUniqueOrThrow({
      where: { id: m.organizationId },
    });
    const token = randomToken();
    const invitation = await this.prisma.$transaction(async (tx) => {
      // Una sola invitación vigente por correo: las anteriores se revocan.
      await tx.invitation.updateMany({
        where: {
          organizationId: m.organizationId,
          email: body.email,
          acceptedAt: null,
          revokedAt: null,
        },
        data: { revokedAt: new Date() },
      });
      const inv = await tx.invitation.create({
        data: {
          organizationId: m.organizationId,
          email: body.email,
          roleId: role.id,
          tokenHash: sha256(token),
          expiresAt: new Date(Date.now() + INVITATION_TTL_MS),
          createdBy: user.id,
        },
        select: {
          id: true,
          email: true,
          expiresAt: true,
          createdAt: true,
          role: { select: { id: true, name: true } },
        },
      });
      await this.audit.record(
        {
          action: 'INVITATION_CREATED',
          entity: 'invitation',
          entityId: inv.id,
          after: { email: body.email, role: role.key },
        },
        tx,
      );
      return inv;
    });

    await this.mail.send({
      to: body.email,
      subject: `Invitación a ${org.legalName} · FinAgent AI`,
      text:
        `${user.fullName} le invitó a ${org.legalName} en FinAgent AI con el rol ${role.name}.\n\n` +
        `Acepte la invitación (válida 7 días):\n${config.WEB_ORIGIN}/accept-invitation?token=${token}\n`,
    });
    return invitation;
  }

  @Delete('invitations/:id')
  @Org('users.manage')
  @HttpCode(204)
  async revokeInvitation(
    @CurrentMembership() m: ActiveMembership,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    const { count } = await this.prisma.invitation.updateMany({
      where: { id, organizationId: m.organizationId, acceptedAt: null, revokedAt: null },
      data: { revokedAt: new Date() },
    });
    if (!count) throw Errors.notFound('La invitación');
    await this.audit.record({ action: 'INVITATION_REVOKED', entity: 'invitation', entityId: id });
  }

  /** Cambiar rol o desactivar. Reglas: no sobre uno mismo, sin escalada y nunca dejar la organización sin Propietario. */
  @Patch(':memberId')
  @Org('users.manage')
  async update(
    @CurrentMembership() m: ActiveMembership,
    @Param('memberId', ParseUUIDPipe) memberId: string,
    @Body(new ZodPipe(UpdateMemberRequest)) body: z.infer<typeof UpdateMemberRequest>,
  ) {
    if (memberId === m.memberId)
      throw Errors.forbidden('No puede cambiar su propio rol ni desactivarse.');
    const target = await this.prisma.organizationMember.findFirst({
      where: { id: memberId, organizationId: m.organizationId },
      include: { role: { select: { key: true, isSystem: true } } },
    });
    if (!target) throw Errors.notFound('El usuario');
    if (target.role.isSystem && target.role.key === 'OWNER' && m.roleKey !== 'OWNER') {
      throw Errors.forbidden('Solo un Propietario puede modificar a otro Propietario.');
    }
    if (body.roleId) await this.loadAssignableRole(m, body.roleId);

    return this.prisma.$transaction(async (tx) => {
      const updated = await tx.organizationMember.update({
        where: { id: memberId },
        data: {
          ...(body.roleId && { roleId: body.roleId }),
          ...(body.status && { status: body.status }),
        },
        select: {
          id: true,
          status: true,
          user: { select: { id: true, email: true, fullName: true } },
          role: { select: { id: true, key: true, name: true } },
        },
      });
      const owners = await tx.organizationMember.count({
        where: {
          organizationId: m.organizationId,
          status: 'ACTIVE',
          role: { key: 'OWNER', organizationId: null },
        },
      });
      if (owners === 0)
        throw Errors.conflict(
          'LAST_OWNER',
          'La organización debe conservar al menos un Propietario activo.',
        );
      await this.audit.record(
        {
          action: 'MEMBER_UPDATED',
          entity: 'organization_member',
          entityId: memberId,
          before: { roleId: target.roleId, status: target.status },
          after: { roleId: updated.role.id, status: updated.status },
        },
        tx,
      );
      return updated;
    });
  }

  /** Alcance por cuenta bancaria: todas o solo las seleccionadas. */
  @Put(':memberId/bank-accounts')
  @Org('users.manage')
  async setAccountScope(
    @CurrentMembership() m: ActiveMembership,
    @Param('memberId', ParseUUIDPipe) memberId: string,
    @Body(new ZodPipe(MemberAccountScopeRequest)) body: z.output<typeof MemberAccountScopeRequest>,
  ) {
    if (memberId === m.memberId) throw Errors.forbidden('No puede cambiar su propio alcance.');
    const target = await this.prisma.organizationMember.findFirst({
      where: { id: memberId, organizationId: m.organizationId },
      include: { bankAccounts: true },
    });
    if (!target) throw Errors.notFound('El usuario');
    const ids = body.scope === 'ALL' ? [] : [...new Set(body.bankAccountIds)];
    if (body.scope === 'SELECTED') {
      if (!ids.length)
        throw Errors.badRequest('ACCOUNTS_REQUIRED', 'Seleccione al menos una cuenta bancaria.');
      const valid = await this.prisma.bankAccount.count({
        where: { organizationId: m.organizationId, id: { in: ids } },
      });
      if (valid !== ids.length) throw Errors.notFound('Una de las cuentas bancarias');
    }
    await this.prisma.$transaction(async (tx) => {
      await tx.memberBankAccount.deleteMany({ where: { memberId } });
      if (ids.length)
        await tx.memberBankAccount.createMany({
          data: ids.map((bankAccountId) => ({ memberId, bankAccountId })),
        });
      await tx.organizationMember.update({
        where: { id: memberId },
        data: { accountScope: body.scope },
      });
      await this.audit.record(
        {
          action: 'MEMBER_ACCOUNT_SCOPE_UPDATED',
          entity: 'organization_member',
          entityId: memberId,
          before: {
            scope: target.accountScope,
            bankAccountIds: target.bankAccounts.map((b) => b.bankAccountId),
          },
          after: { scope: body.scope, bankAccountIds: ids },
        },
        tx,
      );
    });
    return { scope: body.scope, bankAccountIds: ids };
  }
}
