import { Injectable } from '@nestjs/common';
import type { Prisma } from '../../generated/prisma/client.js';
import { ctx } from '../../common/request-context.js';
import { PrismaService } from '../../infrastructure/prisma.service.js';

export type AuditEntry = {
  action: string;
  entity: string;
  entityId?: string | null;
  before?: unknown;
  after?: unknown;
  reason?: string;
  /** Por defecto: organización y usuario del contexto de la solicitud. */
  organizationId?: string | null;
  actorId?: string | null;
};

/** Campos que nunca deben quedar en la bitácora. */
const SECRET_KEYS = new Set(['passwordHash', 'password', 'tokenHash', 'token', 'accountNumberEnc']);

function scrub(value: unknown): Prisma.InputJsonValue | undefined {
  if (value === undefined || value === null) return undefined;
  return JSON.parse(
    JSON.stringify(value, (k, v) =>
      SECRET_KEYS.has(k) ? undefined : typeof v === 'bigint' ? v.toString() : v,
    ),
  );
}

/** Bitácora inmutable (solo inserción; la BD bloquea UPDATE/DELETE). */
@Injectable()
export class AuditService {
  constructor(private readonly prisma: PrismaService) {}

  async record(entry: AuditEntry, tx: Prisma.TransactionClient = this.prisma) {
    const c = ctx();
    await tx.auditLog.create({
      data: {
        organizationId:
          entry.organizationId === undefined ? (c.organizationId ?? null) : entry.organizationId,
        actorId: entry.actorId === undefined ? (c.userId ?? null) : entry.actorId,
        action: entry.action,
        entity: entry.entity,
        entityId: entry.entityId ?? null,
        before: scrub(entry.before),
        after: scrub(entry.after),
        reason: entry.reason ?? null,
        source: c.source,
        ip: c.ip ?? null,
        correlationId: c.correlationId,
      },
    });
  }
}
