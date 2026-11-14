import { type CanActivate, type ExecutionContext, Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { timingSafeEqual } from 'node:crypto';
import type { Request } from 'express';
import { CSRF_COOKIE, CSRF_HEADER, ORG_HEADER } from '@finagent/contracts';
import { ctx } from '../../common/request-context.js';
import { AppError, Errors } from '../../common/errors.js';
import { PrismaService } from '../../infrastructure/prisma.service.js';
import { ACCESS_COOKIE } from './cookies.js';
import { type ActiveMembership, type AuthUser, IS_PUBLIC, ORG_PERMISSIONS } from './decorators.js';
import { verifyAccessToken } from './tokens.js';

type AuthedRequest = Request & { user?: AuthUser; membership?: ActiveMembership };

const SAFE_METHODS = new Set(['GET', 'HEAD', 'OPTIONS']);

/** 1) CSRF por doble envío en todo método de escritura (incluido el login). */
@Injectable()
export class CsrfGuard implements CanActivate {
  canActivate(context: ExecutionContext) {
    const req = context.switchToHttp().getRequest<Request>();
    if (SAFE_METHODS.has(req.method)) return true;
    const cookie = req.cookies?.[CSRF_COOKIE];
    const header = req.headers[CSRF_HEADER];
    const ok =
      typeof cookie === 'string' &&
      typeof header === 'string' &&
      cookie.length === header.length &&
      timingSafeEqual(Buffer.from(cookie), Buffer.from(header));
    if (!ok)
      throw new AppError(403, 'CSRF_INVALID', 'La sesión de seguridad expiró. Recargue la página.');
    return true;
  }
}

/** 2) Sesión: access token válido + familia de sesión no revocada + usuario activo. */
@Injectable()
export class AuthGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly prisma: PrismaService,
  ) {}

  async canActivate(context: ExecutionContext) {
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (isPublic) return true;

    const req = context.switchToHttp().getRequest<AuthedRequest>();
    const claims = await verifyAccessToken(req.cookies?.[ACCESS_COOKIE] ?? '');
    if (!claims) throw Errors.unauthorized();

    // Consultar la sesión en cada solicitud permite cerrar sesiones de forma inmediata.
    const session = await this.prisma.userSession.findFirst({
      where: {
        familyId: claims.sessionFamilyId,
        userId: claims.userId,
        revokedAt: null,
        expiresAt: { gt: new Date() },
      },
      select: {
        user: { select: { id: true, email: true, fullName: true, status: true, deletedAt: true } },
      },
    });
    if (!session || session.user.status !== 'ACTIVE' || session.user.deletedAt)
      throw Errors.unauthorized();

    req.user = { ...session.user, sessionFamilyId: claims.sessionFamilyId };
    ctx().userId = session.user.id;
    return true;
  }
}

/** 3) Organización activa y permisos (RBAC verificado siempre en el backend). */
@Injectable()
export class OrgGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly prisma: PrismaService,
  ) {}

  async canActivate(context: ExecutionContext) {
    const required = this.reflector.getAllAndOverride<string[] | undefined>(ORG_PERMISSIONS, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (!required) return true;

    const req = context.switchToHttp().getRequest<AuthedRequest>();
    const orgId = req.headers[ORG_HEADER];
    if (typeof orgId !== 'string' || !/^[0-9a-f-]{36}$/i.test(orgId)) {
      throw Errors.badRequest('ORGANIZATION_REQUIRED', 'Seleccione una organización.');
    }

    const member = await this.prisma.organizationMember.findUnique({
      where: { organizationId_userId: { organizationId: orgId, userId: req.user!.id } },
      select: {
        id: true,
        status: true,
        roleId: true,
        role: { select: { key: true, permissions: { select: { permissionKey: true } } } },
        organization: { select: { status: true } },
      },
    });
    // Misma respuesta si la organización no existe o no es miembro: no se revela su existencia.
    if (!member || member.status !== 'ACTIVE' || member.organization.status !== 'ACTIVE') {
      throw Errors.forbidden('No tiene acceso a esta organización.');
    }

    const permissions = new Set(member.role.permissions.map((p) => p.permissionKey));
    if (!required.every((p) => permissions.has(p))) throw Errors.forbidden();

    req.membership = {
      organizationId: orgId,
      memberId: member.id,
      roleId: member.roleId,
      roleKey: member.role.key,
      permissions,
    };
    ctx().organizationId = orgId;
    return true;
  }
}
