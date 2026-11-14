import type { INestApplication } from '@nestjs/common';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { PrismaService } from '../src/infrastructure/prisma.service.js';
import { createOrg, createTestApp, createUser, loggedIn, uniqueEmail } from './helpers.js';

let app: INestApplication;
let prisma: PrismaService;
const roleId = async (key: string) =>
  (await prisma.role.findFirstOrThrow({ where: { key, organizationId: null } })).id;

beforeAll(async () => ({ app, prisma } = await createTestApp()));
afterAll(async () => app?.close());

describe('RBAC (verificado en el backend)', () => {
  it('prueba 18: una acción sin permiso responde 403 aunque la UI la oculte', async () => {
    const org = await createOrg(prisma);
    const viewer = await createUser(prisma, org.id, 'VIEWER');
    const c = await loggedIn(app, viewer.email, org.id);
    const res = await c
      .post('/api/users/invitations', { email: uniqueEmail('x'), roleId: await roleId('VIEWER') })
      .expect(403);
    expect(res.body).toMatchObject({
      code: 'FORBIDDEN',
      message: 'No tiene permiso para realizar esta acción.',
    });
    await c.get('/api/audit-logs').expect(403);
    await c.get('/api/users').expect(403);
  });

  it('las rutas de organización exigen la cabecera X-Organization-Id', async () => {
    const org = await createOrg(prisma);
    const owner = await createUser(prisma, org.id, 'OWNER');
    const c = await loggedIn(app, owner.email);
    const res = await c.get('/api/users').expect(400);
    expect(res.body.code).toBe('ORGANIZATION_REQUIRED');
  });

  it('sin escalada: un Administrador no asigna Propietario ni crea roles con permisos que no tiene', async () => {
    const org = await createOrg(prisma);
    const admin = await createUser(prisma, org.id, 'ADMINISTRATOR');
    const c = await loggedIn(app, admin.email, org.id);
    await c
      .post('/api/users/invitations', { email: uniqueEmail('x'), roleId: await roleId('OWNER') })
      .expect(403);
    await c
      .post('/api/roles', { name: 'Superpoderes', permissions: ['organization.manage'] })
      .expect(403);
    const ok = await c
      .post('/api/roles', {
        name: 'Tesorería',
        permissions: ['reconciliations.read', 'reports.read'],
      })
      .expect(201);
    expect(ok.body.key).toBe('CUSTOM_TESORERIA');
  });

  it('nadie cambia su propio rol, y los roles de sistema no se editan', async () => {
    const org = await createOrg(prisma);
    const owner = await createUser(prisma, org.id, 'OWNER');
    const c = await loggedIn(app, owner.email, org.id);
    const member = await prisma.organizationMember.findFirstOrThrow({
      where: { userId: owner.id },
    });
    await c.patch(`/api/users/${member.id}`, { status: 'DISABLED' }).expect(403);
    await c
      .patch(`/api/roles/${await roleId('VIEWER')}`, {
        name: 'Consulta editada',
        permissions: ['reports.read'],
      })
      .expect(404);
  });

  it('un usuario desactivado pierde el acceso a esa organización de inmediato', async () => {
    const org = await createOrg(prisma);
    const owner = await createUser(prisma, org.id, 'OWNER');
    const accountant = await createUser(prisma, org.id, 'ACCOUNTANT');
    const ownerClient = await loggedIn(app, owner.email, org.id);
    const accClient = await loggedIn(app, accountant.email, org.id);
    await accClient.get('/api/organizations/current').expect(200);
    const member = await prisma.organizationMember.findFirstOrThrow({
      where: { userId: accountant.id },
    });
    await ownerClient.patch(`/api/users/${member.id}`, { status: 'DISABLED' }).expect(200);
    await accClient.get('/api/organizations/current').expect(403);
    expect(
      await prisma.auditLog.count({ where: { action: 'MEMBER_UPDATED', entityId: member.id } }),
    ).toBe(1);
  });

  it('quien crea una organización queda como Propietario', async () => {
    const user = await createUser(prisma, null, 'VIEWER');
    const c = await loggedIn(app, user.email);
    const nit = `9${String(Math.random()).slice(2, 10)}-1`;
    const res = await c
      .post('/api/organizations', { nit, legalName: 'Nueva Empresa S.A.S.' })
      .expect(201);
    c.orgId = res.body.id;
    const me = await c.get('/api/auth/me').expect(200);
    expect(me.body.memberships[0].role.key).toBe('OWNER');
    await c.post('/api/organizations', { nit, legalName: 'Duplicada' }).expect(409);
  });
});

describe('prueba 24: aislamiento entre organizaciones', () => {
  it('un usuario de A no ve datos de B aunque envíe el identificador de B', async () => {
    const orgA = await createOrg(prisma, 'Empresa A S.A.S.');
    const orgB = await createOrg(prisma, 'Empresa B S.A.S.');
    const ownerA = await createUser(prisma, orgA.id, 'OWNER');
    const ownerB = await createUser(prisma, orgB.id, 'OWNER');
    const a = await loggedIn(app, ownerA.email, orgB.id);

    for (const url of [
      '/api/users',
      '/api/roles',
      '/api/audit-logs',
      '/api/organizations/current',
    ]) {
      const res = await a.get(url).expect(403);
      expect(res.body.message).toBe('No tiene acceso a esta organización.');
    }
    // Recurso de B con la organización de A: no existe para A.
    a.orgId = orgA.id;
    const memberB = await prisma.organizationMember.findFirstOrThrow({
      where: { userId: ownerB.id },
    });
    await a.patch(`/api/users/${memberB.id}`, { status: 'DISABLED' }).expect(404);
    const list = await a.get('/api/organizations').expect(200);
    expect(list.body.map((o: { id: string }) => o.id)).toEqual([orgA.id]);
  });

  it('la auditoría solo devuelve registros de la organización activa', async () => {
    const orgA = await createOrg(prisma, 'Auditada A');
    const orgB = await createOrg(prisma, 'Auditada B');
    await prisma.auditLog.create({
      data: { organizationId: orgB.id, action: 'SECRETO_B', entity: 'test', source: 'SYSTEM' },
    });
    await prisma.auditLog.create({
      data: { organizationId: orgA.id, action: 'VISIBLE_A', entity: 'test', source: 'SYSTEM' },
    });
    const auditor = await createUser(prisma, orgA.id, 'AUDITOR');
    const c = await loggedIn(app, auditor.email, orgA.id);
    const res = await c.get('/api/audit-logs?entity=test').expect(200);
    expect(res.body.data.map((r: { action: string }) => r.action)).toEqual(['VISIBLE_A']);
  });
});
