import { Errors } from '../../common/errors.js';
import type { ActiveMembership } from '../auth/decorators.js';

/** Filtro Prisma de cuentas bancarias visibles para el miembro (organización + alcance por cuenta). */
export function accessibleAccounts(m: ActiveMembership) {
  return {
    organizationId: m.organizationId,
    ...(m.bankAccountIds && { id: { in: [...m.bankAccountIds] } }),
  };
}

/** Lanza 404 (no 403) para no revelar la existencia de cuentas fuera del alcance. */
export function assertAccountAccess(m: ActiveMembership, bankAccountId: string) {
  if (m.bankAccountIds && !m.bankAccountIds.has(bankAccountId))
    throw Errors.notFound('La cuenta bancaria');
}
