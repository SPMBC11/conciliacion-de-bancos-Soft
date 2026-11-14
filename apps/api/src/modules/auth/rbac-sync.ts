import { PERMISSIONS, SYSTEM_ROLES } from '@finagent/contracts';
import type { PrismaClient } from '../../generated/prisma/client.js';

/**
 * Sincroniza el catálogo de permisos y los roles de sistema desde el código (idempotente).
 * Se ejecuta al arrancar la API y en la CLI de arranque.
 */
export async function syncRbac(prisma: PrismaClient) {
  await prisma.$transaction(async (tx) => {
    for (const [key, description] of Object.entries(PERMISSIONS)) {
      await tx.permission.upsert({
        where: { key },
        create: { key, description },
        update: { description },
      });
    }
    for (const [key, def] of Object.entries(SYSTEM_ROLES)) {
      const existing = await tx.role.findFirst({ where: { key, organizationId: null } });
      const role = existing
        ? await tx.role.update({ where: { id: existing.id }, data: { name: def.name } })
        : await tx.role.create({ data: { key, name: def.name, isSystem: true } });
      await tx.rolePermission.deleteMany({ where: { roleId: role.id } });
      await tx.rolePermission.createMany({
        data: def.permissions.map((permissionKey) => ({ roleId: role.id, permissionKey })),
      });
    }
  });
}
