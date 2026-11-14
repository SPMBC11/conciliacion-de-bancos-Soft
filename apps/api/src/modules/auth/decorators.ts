import {
  applyDecorators,
  createParamDecorator,
  type ExecutionContext,
  SetMetadata,
} from '@nestjs/common';
import type { PermissionKey } from '@finagent/contracts';

export const IS_PUBLIC = 'isPublic';
export const ORG_PERMISSIONS = 'orgPermissions';

/** Ruta sin sesión (login, recuperación, invitaciones, salud). CSRF sigue aplicando a métodos de escritura. */
export const Public = () => SetMetadata(IS_PUBLIC, true);

/**
 * Exige organización activa (cabecera X-Organization-Id) con membresía vigente y TODOS los permisos dados.
 * Sin permisos: basta con ser miembro activo.
 */
export const Org = (...permissions: PermissionKey[]) =>
  applyDecorators(SetMetadata(ORG_PERMISSIONS, permissions));

export type AuthUser = { id: string; email: string; fullName: string; sessionFamilyId: string };
export type ActiveMembership = {
  organizationId: string;
  memberId: string;
  roleId: string;
  roleKey: string;
  permissions: Set<string>;
  /** null = acceso a todas las cuentas bancarias; si no, solo a estas. */
  bankAccountIds: Set<string> | null;
};

export const CurrentUser = createParamDecorator(
  (_: unknown, c: ExecutionContext) => c.switchToHttp().getRequest<{ user: AuthUser }>().user,
);

export const CurrentMembership = createParamDecorator(
  (_: unknown, c: ExecutionContext) =>
    c.switchToHttp().getRequest<{ membership: ActiveMembership }>().membership,
);
