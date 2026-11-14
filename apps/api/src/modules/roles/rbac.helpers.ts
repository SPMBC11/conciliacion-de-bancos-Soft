import { Errors } from '../../common/errors.js';
import type { ActiveMembership } from '../auth/decorators.js';

/** Nadie puede otorgar permisos que no tiene (evita escalada de privilegios). */
export function assertCanGrant(actor: ActiveMembership, permissions: string[]) {
  const missing = permissions.filter((p) => !actor.permissions.has(p));
  if (missing.length) {
    throw Errors.forbidden(`No puede otorgar permisos que usted no tiene: ${missing.join(', ')}.`);
  }
}

/** Solo un Propietario puede asignar el rol Propietario. */
export function assertCanAssignRole(
  actor: ActiveMembership,
  role: { key: string; isSystem: boolean },
  permissions: string[],
) {
  if (role.isSystem && role.key === 'OWNER' && actor.roleKey !== 'OWNER') {
    throw Errors.forbidden('Solo un Propietario puede asignar el rol Propietario.');
  }
  assertCanGrant(actor, permissions);
}
