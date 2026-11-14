/**
 * Arranque inicial: crea la organización (si no existe) y una invitación de Propietario.
 * Uso: npm run bootstrap -w @finagent/api -- --nit 900123456-7 --name "Empresa S.A.S." --email dueno@empresa.co
 * Imprime el enlace de aceptación (y lo envía por correo si hay SMTP).
 */
import { parseArgs } from 'node:util';
import { PrismaPg } from '@prisma/adapter-pg';
import { CreateOrganizationRequest, Email } from '@finagent/contracts';
import { config } from '../config.js';
import { PrismaClient } from '../generated/prisma/client.js';
import { syncRbac } from '../modules/auth/rbac-sync.js';
import { INVITATION_TTL_MS, randomToken, sha256 } from '../modules/auth/tokens.js';

const { values } = parseArgs({
  options: { nit: { type: 'string' }, name: { type: 'string' }, email: { type: 'string' } },
});

const org = CreateOrganizationRequest.safeParse({ nit: values.nit, legalName: values.name });
const email = Email.safeParse(values.email);
if (!org.success || !email.success) {
  console.error('Uso: --nit 900123456-7 --name "Razón social" --email propietario@empresa.co');
  process.exit(1);
}

const prisma = new PrismaClient({
  adapter: new PrismaPg({ connectionString: config.DATABASE_URL }),
});
try {
  await syncRbac(prisma);
  const owner = await prisma.role.findFirstOrThrow({
    where: { key: 'OWNER', organizationId: null },
  });
  const organization =
    (await prisma.organization.findUnique({ where: { nit: org.data.nit } })) ??
    (await prisma.organization.create({
      data: { nit: org.data.nit, legalName: org.data.legalName },
    }));

  const token = randomToken();
  await prisma.$transaction([
    prisma.invitation.updateMany({
      where: {
        organizationId: organization.id,
        email: email.data,
        acceptedAt: null,
        revokedAt: null,
      },
      data: { revokedAt: new Date() },
    }),
    prisma.invitation.create({
      data: {
        organizationId: organization.id,
        email: email.data,
        roleId: owner.id,
        tokenHash: sha256(token),
        expiresAt: new Date(Date.now() + INVITATION_TTL_MS),
      },
    }),
    prisma.auditLog.create({
      data: {
        organizationId: organization.id,
        action: 'BOOTSTRAP_OWNER_INVITED',
        entity: 'invitation',
        after: { email: email.data },
        source: 'SYSTEM',
      },
    }),
  ]);
  console.log(`Organización: ${organization.legalName} (${organization.nit})`);
  console.log(`Invitación de Propietario para ${email.data} (válida 7 días):`);
  console.log(`${config.WEB_ORIGIN}/accept-invitation?token=${token}`);
} finally {
  await prisma.$disconnect();
}
