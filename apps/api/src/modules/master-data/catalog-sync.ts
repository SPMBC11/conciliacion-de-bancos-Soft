import { COLOMBIAN_BANKS } from '@finagent/contracts';
import type { PrismaClient } from '../../generated/prisma/client.js';

/** Bancos precargados (idempotente). */
export async function syncBanks(prisma: PrismaClient) {
  const existing = new Set(
    (await prisma.bank.findMany({ where: { organizationId: null }, select: { name: true } })).map(
      (b) => b.name,
    ),
  );
  const missing = COLOMBIAN_BANKS.filter((name) => !existing.has(name));
  if (missing.length) await prisma.bank.createMany({ data: missing.map((name) => ({ name })) });
}
