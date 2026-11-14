import { Controller, Get, Query } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { z } from 'zod';
import { ZodPipe } from '../../common/zod.pipe.js';
import { ctx } from '../../common/request-context.js';
import { PrismaService } from '../../infrastructure/prisma.service.js';
import { Org } from '../auth/decorators.js';

const AuditQuery = z.object({
  action: z.string().max(80).optional(),
  entity: z.string().max(80).optional(),
  actorId: z.uuid().optional(),
  from: z.iso.date().optional(),
  to: z.iso.date().optional(),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(200).default(50),
});

@ApiTags('audit')
@Controller('audit-logs')
export class AuditController {
  constructor(private readonly prisma: PrismaService) {}

  /** Solo registros de la organización activa (aislamiento). Fechas en hora de Bogotá. */
  @Get()
  @Org('audit.read')
  async list(@Query(new ZodPipe(AuditQuery)) q: z.infer<typeof AuditQuery>) {
    const where = {
      organizationId: ctx().organizationId!,
      ...(q.action && { action: q.action }),
      ...(q.entity && { entity: q.entity }),
      ...(q.actorId && { actorId: q.actorId }),
      ...((q.from || q.to) && {
        createdAt: {
          ...(q.from && { gte: new Date(`${q.from}T00:00:00-05:00`) }),
          ...(q.to && { lte: new Date(`${q.to}T23:59:59.999-05:00`) }),
        },
      }),
    };
    const [total, rows] = await Promise.all([
      this.prisma.auditLog.count({ where }),
      this.prisma.auditLog.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip: (q.page - 1) * q.pageSize,
        take: q.pageSize,
      }),
    ]);
    const actorIds = [...new Set(rows.map((r) => r.actorId).filter((id): id is string => !!id))];
    const actors = await this.prisma.user.findMany({
      where: { id: { in: actorIds } },
      select: { id: true, fullName: true, email: true },
    });
    const byId = new Map(actors.map((a) => [a.id, a]));
    return {
      data: rows.map((r) => ({ ...r, actor: r.actorId ? (byId.get(r.actorId) ?? null) : null })),
      page: q.page,
      pageSize: q.pageSize,
      total,
    };
  }
}
