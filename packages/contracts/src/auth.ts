import { z } from 'zod';

/** Catálogo de permisos. Fuente única: la API lo sincroniza en BD al arrancar y la web lo usa para la UI. */
export const PERMISSIONS = {
  'organization.manage': 'Editar los datos de la organización',
  'users.read': 'Ver usuarios de la organización',
  'users.manage': 'Invitar, cambiar rol y desactivar usuarios',
  'roles.manage': 'Crear y editar roles personalizados',
  'audit.read': 'Consultar la bitácora de auditoría',
  'bank_accounts.read': 'Ver cuentas bancarias',
  'bank_accounts.manage': 'Crear y editar cuentas bancarias',
  'master_data.manage': 'Editar PUC, mapeos, periodos y festivos',
  'documents.import': 'Subir e importar extractos y auxiliares',
  'rules.manage': 'Configurar reglas de conciliación y clasificación',
  'reconciliations.read': 'Ver conciliaciones',
  'reconciliations.prepare': 'Elaborar conciliaciones (conciliar, partidas, enviar a revisión)',
  'reconciliations.review': 'Revisar conciliaciones (aprobar revisión o devolver)',
  'reconciliations.approve': 'Aprobar conciliaciones',
  'reconciliations.approve_with_difference':
    'Aprobar con diferencia distinta de cero (excepcional)',
  'reconciliations.close': 'Cerrar periodos',
  'reconciliations.reopen': 'Reabrir periodos cerrados',
  'adjustments.manage': 'Proponer y editar asientos de ajuste',
  'adjustments.approve': 'Aprobar y reversar asientos de ajuste',
  'reports.read': 'Ver informes',
  'reports.export': 'Exportar informes y archivos',
} as const;

export type PermissionKey = keyof typeof PERMISSIONS;
export const PERMISSION_KEYS = Object.keys(PERMISSIONS) as PermissionKey[];

const READ_ONLY: PermissionKey[] = ['bank_accounts.read', 'reconciliations.read', 'reports.read'];

/** Roles de sistema (sección 17). No editables; las organizaciones pueden crear roles propios. */
export const SYSTEM_ROLES = {
  OWNER: { name: 'Propietario', permissions: PERMISSION_KEYS },
  ADMINISTRATOR: {
    name: 'Administrador',
    permissions: PERMISSION_KEYS.filter(
      (p) =>
        ![
          'organization.manage',
          'reconciliations.reopen',
          'reconciliations.approve_with_difference',
        ].includes(p),
    ),
  },
  ACCOUNTANT: {
    name: 'Contador',
    permissions: [
      ...READ_ONLY,
      'users.read',
      'documents.import',
      'reconciliations.prepare',
      'adjustments.manage',
      'reports.export',
    ],
  },
  REVIEWER: {
    name: 'Revisor',
    permissions: [...READ_ONLY, 'users.read', 'reconciliations.review', 'reports.export'],
  },
  AUDITOR: {
    name: 'Auditor',
    permissions: [...READ_ONLY, 'users.read', 'audit.read', 'reports.export'],
  },
  VIEWER: { name: 'Consulta', permissions: READ_ONLY },
} as const satisfies Record<string, { name: string; permissions: readonly PermissionKey[] }>;

export type SystemRoleKey = keyof typeof SYSTEM_ROLES;

export const PASSWORD_MIN_LENGTH = 12;

export const Password = z
  .string()
  .min(PASSWORD_MIN_LENGTH, `La contraseña debe tener al menos ${PASSWORD_MIN_LENGTH} caracteres.`)
  .max(128, 'La contraseña es demasiado larga.');

export const Email = z.string().trim().toLowerCase().pipe(z.email('Correo electrónico inválido.'));

export const LoginRequest = z.object({ email: Email, password: z.string().min(1).max(128) });
export type LoginRequest = z.infer<typeof LoginRequest>;

export const ForgotPasswordRequest = z.object({ email: Email });
export const ResetPasswordRequest = z.object({ token: z.string().min(20), password: Password });
export const ChangePasswordRequest = z.object({
  currentPassword: z.string().min(1),
  newPassword: Password,
});

export const AcceptInvitationRequest = z.object({
  token: z.string().min(20),
  /** Obligatorio solo para cuentas nuevas. */
  fullName: z.string().trim().min(3, 'Escriba su nombre completo.').max(120).optional(),
  password: z.string().min(1).max(128),
});

export const InviteUserRequest = z.object({ email: Email, roleId: z.uuid() });
export const UpdateMemberRequest = z
  .object({ roleId: z.uuid().optional(), status: z.enum(['ACTIVE', 'DISABLED']).optional() })
  .refine((v) => v.roleId || v.status, 'Indique el rol o el estado.');

export const UpsertRoleRequest = z.object({
  name: z.string().trim().min(3).max(60),
  description: z.string().trim().max(200).optional(),
  permissions: z.array(z.enum(PERMISSION_KEYS as [PermissionKey, ...PermissionKey[]])).min(1),
});

export const CreateOrganizationRequest = z.object({
  nit: z
    .string()
    .trim()
    .regex(/^\d{6,10}-?\d?$/, 'NIT inválido (ej. 900123456-7).'),
  legalName: z.string().trim().min(3).max(200),
  functionalCurrency: z.enum(['COP', 'USD']).default('COP'),
});

export const Membership = z.object({
  organizationId: z.uuid(),
  organizationName: z.string(),
  nit: z.string(),
  role: z.object({ id: z.uuid(), key: z.string(), name: z.string() }),
  permissions: z.array(z.string()),
});
export type Membership = z.infer<typeof Membership>;

export const MeResponse = z.object({
  user: z.object({ id: z.uuid(), email: z.string(), fullName: z.string() }),
  memberships: z.array(Membership),
});
export type MeResponse = z.infer<typeof MeResponse>;

/** Cabecera con la organización activa de cada solicitud. */
export const ORG_HEADER = 'x-organization-id';
/** Doble envío CSRF: cookie legible + cabecera. */
export const CSRF_COOKIE = 'fa_csrf';
export const CSRF_HEADER = 'x-csrf-token';
