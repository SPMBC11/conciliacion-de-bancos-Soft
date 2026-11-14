import { Injectable } from '@nestjs/common';
import argon2 from 'argon2';
import { randomUUID } from 'node:crypto';
import { type MeResponse, Password } from '@finagent/contracts';
import { config } from '../../config.js';
import { AppError, Errors } from '../../common/errors.js';
import { ctx } from '../../common/request-context.js';
import { MailService } from '../../infrastructure/mail.service.js';
import { PrismaService } from '../../infrastructure/prisma.service.js';
import { AuditService } from '../audit/audit.service.js';
import { randomToken, REFRESH_TTL_MS, RESET_TTL_MS, sha256, signAccessToken } from './tokens.js';

const MAX_FAILED_LOGINS = 5;
const LOCK_MS = 15 * 60 * 1000;
/** Si dos pestañas refrescan a la vez, la segunda ve el token ya rotado: no es un robo si ocurre en esta ventana. */
const ROTATION_GRACE_MS = 30 * 1000;

const INVALID_CREDENTIALS = 'Correo o contraseña incorrectos.';

export type IssuedSession = { accessToken: string; refreshToken: string; userId: string };

@Injectable()
export class AuthService {
  /** Hash ficticio: verificar contra él cuando el usuario no existe iguala el tiempo de respuesta. */
  private readonly dummyHash = argon2.hash('finagent-dummy-password');

  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly mail: MailService,
  ) {}

  hashPassword(password: string) {
    return argon2.hash(password, { type: argon2.argon2id });
  }

  // ---------- Sesiones ----------

  private async issueSession(
    userId: string,
    familyId: string = randomUUID(),
  ): Promise<IssuedSession> {
    const refreshToken = randomToken();
    const c = ctx();
    await this.prisma.userSession.create({
      data: {
        userId,
        familyId,
        tokenHash: sha256(refreshToken),
        ip: c.ip ?? null,
        userAgent: c.userAgent ?? null,
        expiresAt: new Date(Date.now() + REFRESH_TTL_MS),
      },
    });
    return { accessToken: await signAccessToken(userId, familyId), refreshToken, userId };
  }

  async login(email: string, password: string): Promise<IssuedSession> {
    const user = await this.prisma.user.findUnique({ where: { email } });

    if (!user || !user.passwordHash || user.status !== 'ACTIVE' || user.deletedAt) {
      await argon2.verify(await this.dummyHash, password);
      await this.audit.record({
        action: 'AUTH_LOGIN_FAILED',
        entity: 'user',
        entityId: user?.id,
        after: { email, reason: user ? 'INACTIVE' : 'UNKNOWN_EMAIL' },
        actorId: null,
        organizationId: null,
      });
      throw Errors.unauthorized(INVALID_CREDENTIALS);
    }

    if (user.lockedUntil && user.lockedUntil > new Date()) {
      throw new AppError(
        429,
        'ACCOUNT_LOCKED',
        'Demasiados intentos fallidos. Intente de nuevo en 15 minutos.',
      );
    }

    if (!(await argon2.verify(user.passwordHash, password))) {
      const failed = user.failedLoginCount + 1;
      const lock = failed >= MAX_FAILED_LOGINS;
      await this.prisma.user.update({
        where: { id: user.id },
        data: {
          failedLoginCount: lock ? 0 : failed,
          lockedUntil: lock ? new Date(Date.now() + LOCK_MS) : null,
        },
      });
      await this.audit.record({
        action: lock ? 'AUTH_ACCOUNT_LOCKED' : 'AUTH_LOGIN_FAILED',
        entity: 'user',
        entityId: user.id,
        after: { failedAttempts: failed },
        actorId: null,
        organizationId: null,
      });
      throw Errors.unauthorized(INVALID_CREDENTIALS);
    }

    await this.prisma.user.update({
      where: { id: user.id },
      data: { failedLoginCount: 0, lockedUntil: null, lastLoginAt: new Date() },
    });
    const session = await this.issueSession(user.id);
    await this.audit.record({
      action: 'AUTH_LOGIN_SUCCEEDED',
      entity: 'user',
      entityId: user.id,
      actorId: user.id,
      organizationId: null,
    });
    return session;
  }

  /** Rotación: cada refresh token sirve una sola vez. Reutilizar uno ya rotado revoca toda la familia. */
  async refresh(refreshToken: string | undefined): Promise<IssuedSession> {
    if (!refreshToken) throw Errors.unauthorized();
    const session = await this.prisma.userSession.findUnique({
      where: { tokenHash: sha256(refreshToken) },
      include: { user: { select: { status: true, deletedAt: true } } },
    });
    if (!session || session.revokedAt || session.expiresAt <= new Date())
      throw Errors.unauthorized();
    if (session.user.status !== 'ACTIVE' || session.user.deletedAt) throw Errors.unauthorized();

    if (session.rotatedAt) {
      if (Date.now() - session.rotatedAt.getTime() < ROTATION_GRACE_MS) {
        // Carrera entre pestañas: la otra ya obtuvo cookies nuevas (compartidas). No se revoca.
        throw new AppError(401, 'REFRESH_RACE', 'Sesión renovada en otra pestaña.');
      }
      await this.revokeFamily(session.familyId, 'REUSE_DETECTED');
      await this.audit.record({
        action: 'AUTH_REFRESH_REUSE_DETECTED',
        entity: 'user_session',
        entityId: session.familyId,
        actorId: session.userId,
        organizationId: null,
      });
      throw Errors.unauthorized('Su sesión se cerró por seguridad. Inicie sesión de nuevo.');
    }

    // Marcar como rotado de forma condicional evita que dos solicitudes simultáneas roten el mismo token.
    const { count } = await this.prisma.userSession.updateMany({
      where: { id: session.id, rotatedAt: null },
      data: { rotatedAt: new Date(), lastUsedAt: new Date() },
    });
    if (count === 0) throw new AppError(401, 'REFRESH_RACE', 'Sesión renovada en otra pestaña.');
    return this.issueSession(session.userId, session.familyId);
  }

  async revokeFamily(familyId: string, reason: string) {
    await this.prisma.userSession.updateMany({
      where: { familyId, revokedAt: null },
      data: { revokedAt: new Date(), revokeReason: reason },
    });
  }

  async logout(userId: string, familyId: string) {
    await this.revokeFamily(familyId, 'LOGOUT');
    await this.audit.record({
      action: 'AUTH_LOGOUT',
      entity: 'user_session',
      entityId: familyId,
      actorId: userId,
      organizationId: null,
    });
  }

  async listSessions(userId: string, currentFamilyId: string) {
    const rows = await this.prisma.userSession.findMany({
      where: { userId, revokedAt: null, rotatedAt: null, expiresAt: { gt: new Date() } },
      orderBy: { lastUsedAt: 'desc' },
      select: { familyId: true, userAgent: true, ip: true, createdAt: true, lastUsedAt: true },
    });
    return rows.map((r) => ({ ...r, current: r.familyId === currentFamilyId }));
  }

  async revokeSession(userId: string, familyId: string) {
    const owned = await this.prisma.userSession.findFirst({ where: { userId, familyId } });
    if (!owned) throw Errors.notFound('La sesión');
    await this.revokeFamily(familyId, 'REVOKED_BY_USER');
    await this.audit.record({
      action: 'SESSION_REVOKED',
      entity: 'user_session',
      entityId: familyId,
      organizationId: null,
    });
  }

  async me(userId: string): Promise<MeResponse> {
    const user = await this.prisma.user.findUniqueOrThrow({
      where: { id: userId },
      select: {
        id: true,
        email: true,
        fullName: true,
        memberships: {
          where: { status: 'ACTIVE', organization: { status: 'ACTIVE' } },
          orderBy: { organization: { legalName: 'asc' } },
          select: {
            organization: { select: { id: true, legalName: true, nit: true } },
            role: {
              select: {
                id: true,
                key: true,
                name: true,
                permissions: { select: { permissionKey: true } },
              },
            },
          },
        },
      },
    });
    return {
      user: { id: user.id, email: user.email, fullName: user.fullName },
      memberships: user.memberships.map((m) => ({
        organizationId: m.organization.id,
        organizationName: m.organization.legalName,
        nit: m.organization.nit,
        role: { id: m.role.id, key: m.role.key, name: m.role.name },
        permissions: m.role.permissions.map((p) => p.permissionKey),
      })),
    };
  }

  // ---------- Contraseñas ----------

  /** Siempre responde igual exista o no la cuenta (no permite descubrir correos registrados). */
  async forgotPassword(email: string) {
    const user = await this.prisma.user.findUnique({ where: { email } });
    if (!user || user.status !== 'ACTIVE' || user.deletedAt) return;
    const token = randomToken();
    await this.prisma.passwordResetToken.create({
      data: {
        userId: user.id,
        tokenHash: sha256(token),
        expiresAt: new Date(Date.now() + RESET_TTL_MS),
      },
    });
    await this.audit.record({
      action: 'AUTH_PASSWORD_RESET_REQUESTED',
      entity: 'user',
      entityId: user.id,
      actorId: user.id,
      organizationId: null,
    });
    await this.mail.send({
      to: user.email,
      subject: 'Restablecer contraseña · FinAgent AI',
      text:
        `Hola ${user.fullName},\n\nPara restablecer su contraseña abra este enlace (válido 1 hora):\n` +
        `${config.WEB_ORIGIN}/reset-password?token=${token}\n\n` +
        'Si usted no lo solicitó, ignore este mensaje: su contraseña no cambiará.',
    });
  }

  async resetPassword(token: string, password: string) {
    const record = await this.prisma.passwordResetToken.findUnique({
      where: { tokenHash: sha256(token) },
    });
    if (!record || record.usedAt || record.expiresAt <= new Date()) {
      throw Errors.badRequest(
        'RESET_TOKEN_INVALID',
        'El enlace no es válido o expiró. Solicite uno nuevo.',
      );
    }
    const passwordHash = await this.hashPassword(password);
    await this.prisma.$transaction([
      this.prisma.passwordResetToken.update({
        where: { id: record.id },
        data: { usedAt: new Date() },
      }),
      this.prisma.user.update({
        where: { id: record.userId },
        data: {
          passwordHash,
          passwordChangedAt: new Date(),
          failedLoginCount: 0,
          lockedUntil: null,
        },
      }),
      this.prisma.userSession.updateMany({
        where: { userId: record.userId, revokedAt: null },
        data: { revokedAt: new Date(), revokeReason: 'PASSWORD_RESET' },
      }),
    ]);
    await this.audit.record({
      action: 'AUTH_PASSWORD_RESET',
      entity: 'user',
      entityId: record.userId,
      actorId: record.userId,
      organizationId: null,
    });
  }

  /** Cambia la contraseña y cierra las demás sesiones (la actual sigue abierta). */
  async changePassword(userId: string, familyId: string, current: string, next: string) {
    const user = await this.prisma.user.findUniqueOrThrow({ where: { id: userId } });
    if (!user.passwordHash || !(await argon2.verify(user.passwordHash, current))) {
      throw Errors.badRequest('CURRENT_PASSWORD_INVALID', 'La contraseña actual no es correcta.');
    }
    await this.prisma.$transaction([
      this.prisma.user.update({
        where: { id: userId },
        data: { passwordHash: await this.hashPassword(next), passwordChangedAt: new Date() },
      }),
      this.prisma.userSession.updateMany({
        where: { userId, revokedAt: null, familyId: { not: familyId } },
        data: { revokedAt: new Date(), revokeReason: 'PASSWORD_CHANGED' },
      }),
    ]);
    await this.audit.record({
      action: 'AUTH_PASSWORD_CHANGED',
      entity: 'user',
      entityId: userId,
      organizationId: null,
    });
  }

  // ---------- Invitaciones ----------

  private async findValidInvitation(token: string) {
    const inv = await this.prisma.invitation.findUnique({
      where: { tokenHash: sha256(token) },
      include: {
        organization: { select: { legalName: true, status: true } },
        role: { select: { name: true } },
      },
    });
    if (
      !inv ||
      inv.acceptedAt ||
      inv.revokedAt ||
      inv.expiresAt <= new Date() ||
      inv.organization.status !== 'ACTIVE'
    ) {
      throw Errors.badRequest(
        'INVITATION_INVALID',
        'La invitación no es válida o expiró. Pida una nueva al administrador.',
      );
    }
    return inv;
  }

  async previewInvitation(token: string) {
    const inv = await this.findValidInvitation(token);
    const existing = await this.prisma.user.findUnique({
      where: { email: inv.email },
      select: { passwordHash: true },
    });
    return {
      email: inv.email,
      organizationName: inv.organization.legalName,
      roleName: inv.role.name,
      existingAccount: !!existing?.passwordHash,
    };
  }

  /**
   * Nueva cuenta: define nombre y contraseña. Cuenta existente (otra organización): confirma su contraseña actual.
   * Al aceptar, inicia sesión.
   */
  async acceptInvitation(
    token: string,
    fullName: string | undefined,
    password: string,
  ): Promise<IssuedSession> {
    const inv = await this.findValidInvitation(token);
    const existing = await this.prisma.user.findUnique({ where: { email: inv.email } });

    if (existing?.passwordHash) {
      if (existing.status !== 'ACTIVE' || !(await argon2.verify(existing.passwordHash, password))) {
        throw Errors.unauthorized(
          'La contraseña no corresponde a la cuenta existente de este correo.',
        );
      }
    }
    if (!existing?.passwordHash) {
      if (!fullName) throw Errors.badRequest('VALIDATION_ERROR', 'Escriba su nombre completo.');
      // Cuenta nueva: se aplica la política de contraseñas.
      const policy = Password.safeParse(password);
      if (!policy.success)
        throw Errors.badRequest('VALIDATION_ERROR', policy.error.issues[0]!.message);
    }
    const passwordHash = existing?.passwordHash ? undefined : await this.hashPassword(password);

    const userId = await this.prisma.$transaction(async (tx) => {
      const claimed = await tx.invitation.updateMany({
        where: { id: inv.id, acceptedAt: null, revokedAt: null },
        data: { acceptedAt: new Date() },
      });
      if (claimed.count === 0)
        throw Errors.badRequest('INVITATION_INVALID', 'La invitación ya fue utilizada.');

      const user = existing
        ? passwordHash
          ? await tx.user.update({
              where: { id: existing.id },
              data: { fullName: fullName!, passwordHash, status: 'ACTIVE' },
            })
          : existing
        : await tx.user.create({
            data: {
              email: inv.email,
              fullName: fullName!,
              passwordHash: passwordHash!,
              status: 'ACTIVE',
            },
          });

      await tx.organizationMember.upsert({
        where: { organizationId_userId: { organizationId: inv.organizationId, userId: user.id } },
        create: {
          organizationId: inv.organizationId,
          userId: user.id,
          roleId: inv.roleId,
          createdBy: inv.createdBy,
        },
        update: { roleId: inv.roleId, status: 'ACTIVE' },
      });
      await this.audit.record(
        {
          action: 'INVITATION_ACCEPTED',
          entity: 'invitation',
          entityId: inv.id,
          after: { email: inv.email, roleId: inv.roleId },
          actorId: user.id,
          organizationId: inv.organizationId,
        },
        tx,
      );
      return user.id;
    });

    return this.issueSession(userId);
  }
}
