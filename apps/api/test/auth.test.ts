import type { INestApplication } from '@nestjs/common';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { PrismaService } from '../src/infrastructure/prisma.service.js';
import {
  Client,
  createOrg,
  createTestApp,
  createUser,
  lastMailTo,
  loggedIn,
  PASSWORD,
  tokenFrom,
  uniqueEmail,
} from './helpers.js';

let app: INestApplication;
let prisma: PrismaService;

beforeAll(async () => ({ app, prisma } = await createTestApp()));
afterAll(async () => app?.close());

const cookieNames = (res: { headers: Record<string, unknown> }) =>
  ((res.headers['set-cookie'] as string[] | undefined) ?? []).map((c) => c.split('=')[0]);

describe('CSRF', () => {
  it('rechaza escrituras sin el token de doble envío (también el login)', async () => {
    const c = new Client(app);
    const res = await c.agent
      .post('/api/auth/login')
      .send({ email: 'x@y.co', password: 'x' })
      .expect(403);
    expect(res.body.code).toBe('CSRF_INVALID');
  });
});

describe('inicio de sesión', () => {
  it('credenciales inválidas → 401 genérico, auditado', async () => {
    const org = await createOrg(prisma);
    const user = await createUser(prisma, org.id, 'ACCOUNTANT');
    const c = await new Client(app).init();
    const res = await c.login(user.email, 'incorrecta').expect(401);
    expect(res.body.message).toBe('Correo o contraseña incorrectos.');
    const unknown = await c.login('nadie@test.finagent.local', 'x').expect(401);
    expect(unknown.body.message).toBe(res.body.message); // no revela si el correo existe
    expect(
      await prisma.auditLog.count({ where: { action: 'AUTH_LOGIN_FAILED', entityId: user.id } }),
    ).toBe(1);
  });

  it('bloquea la cuenta tras 5 intentos fallidos', async () => {
    const user = await createUser(prisma, null, 'VIEWER');
    const c = await new Client(app).init();
    for (let i = 0; i < 5; i++) await c.login(user.email, 'mal').expect(401);
    const res = await c.login(user.email).expect(429); // incluso con la contraseña correcta
    expect(res.body.code).toBe('ACCOUNT_LOCKED');
  });

  it('login correcto: cookies httpOnly SameSite=Strict y /me con membresías y permisos', async () => {
    const org = await createOrg(prisma, 'Empresa Login S.A.S.');
    const user = await createUser(prisma, org.id, 'REVIEWER');
    const c = await new Client(app).init();
    const res = await c.login(user.email).expect(200);
    const cookies = res.headers['set-cookie'] as unknown as string[];
    for (const name of ['fa_at', 'fa_rt']) {
      const cookie = cookies.find((x) => x.startsWith(`${name}=`))!;
      expect(cookie).toMatch(/HttpOnly/);
      expect(cookie).toMatch(/SameSite=Strict/);
    }
    const me = await c.get('/api/auth/me').expect(200);
    expect(me.body.memberships).toHaveLength(1);
    expect(me.body.memberships[0].role.key).toBe('REVIEWER');
    expect(me.body.memberships[0].permissions).toContain('reconciliations.review');
    expect(me.body.memberships[0].permissions).not.toContain('reconciliations.approve');
  });

  it('sin sesión → 401', async () => {
    const c = await new Client(app).init();
    await c.get('/api/auth/me').expect(401);
  });
});

describe('sesiones', () => {
  it('refresh rota el token; reutilizar uno ya rotado cierra toda la familia', async () => {
    const user = await createUser(prisma, null, 'VIEWER');
    const c = await loggedIn(app, user.email);
    const first = await prisma.userSession.findFirstOrThrow({ where: { userId: user.id } });

    const r = await c.post('/api/auth/refresh').expect(200);
    expect(cookieNames(r)).toEqual(expect.arrayContaining(['fa_at', 'fa_rt']));
    expect(await prisma.userSession.count({ where: { familyId: first.familyId } })).toBe(2);

    // Simula un atacante que usa el refresh viejo pasado el margen entre pestañas.
    await prisma.userSession.update({
      where: { id: first.id },
      data: { rotatedAt: new Date(Date.now() - 60_000) },
    });
    const stolen = await new Client(app).init();
    await stolen.agent
      .post('/api/auth/refresh')
      .set('x-csrf-token', stolen.csrf)
      .set('Cookie', `fa_csrf=${stolen.csrf}; fa_rt=${await rawRefreshFor(first.id)}`)
      .expect(401);
    expect(
      await prisma.userSession.count({ where: { familyId: first.familyId, revokedAt: null } }),
    ).toBe(0);
    await c.get('/api/auth/me').expect(401); // la sesión legítima también se cierra
    expect(
      await prisma.auditLog.count({
        where: { action: 'AUTH_REFRESH_REUSE_DETECTED', entityId: first.familyId },
      }),
    ).toBe(1);
  });

  it('logout invalida de inmediato el access token', async () => {
    const user = await createUser(prisma, null, 'VIEWER');
    const c = await loggedIn(app, user.email);
    await c.post('/api/auth/logout').expect(204);
    await c.get('/api/auth/me').expect(401);
  });

  it('lista y revoca sesiones propias', async () => {
    const user = await createUser(prisma, null, 'VIEWER');
    const a = await loggedIn(app, user.email);
    const b = await loggedIn(app, user.email);
    const list = await a.get('/api/auth/sessions').expect(200);
    expect(list.body).toHaveLength(2);
    const other = list.body.find((s: { current: boolean }) => !s.current);
    await a.delete(`/api/auth/sessions/${other.familyId}`).expect(204);
    await b.get('/api/auth/me').expect(401);
    await a.get('/api/auth/me').expect(200);
  });
});

/** El refresh token en claro no se guarda; para la prueba de robo se regenera uno conocido en la fila. */
async function rawRefreshFor(sessionId: string) {
  const { sha256, randomToken } = await import('../src/modules/auth/tokens.js');
  const raw = randomToken();
  await prisma.userSession.update({ where: { id: sessionId }, data: { tokenHash: sha256(raw) } });
  return raw;
}

describe('contraseñas', () => {
  it('recuperación por correo: responde igual exista o no, restablece y cierra sesiones', async () => {
    const user = await createUser(prisma, null, 'VIEWER');
    const session = await loggedIn(app, user.email);
    const c = await new Client(app).init();

    const unknown = await c
      .post('/api/auth/forgot-password', { email: 'nadie@test.finagent.local' })
      .expect(202);
    const known = await c.post('/api/auth/forgot-password', { email: user.email }).expect(202);
    expect(known.body).toEqual(unknown.body);

    const token = tokenFrom(await lastMailTo(user.email));
    await c.post('/api/auth/reset-password', { token, password: 'corta' }).expect(400);
    await c
      .post('/api/auth/reset-password', { token, password: 'Nueva-contraseña-2026' })
      .expect(204);
    await c
      .post('/api/auth/reset-password', { token, password: 'Otra-contraseña-2026' })
      .expect(400); // un solo uso
    await session.get('/api/auth/me').expect(401);
    await c.login(user.email, PASSWORD).expect(401);
    await c.login(user.email, 'Nueva-contraseña-2026').expect(200);
  });

  it('cambio de contraseña exige la actual y cierra las demás sesiones', async () => {
    const user = await createUser(prisma, null, 'VIEWER');
    const a = await loggedIn(app, user.email);
    const b = await loggedIn(app, user.email);
    await a
      .post('/api/auth/change-password', {
        currentPassword: 'mal',
        newPassword: 'Nueva-contraseña-2026',
      })
      .expect(400);
    await a
      .post('/api/auth/change-password', {
        currentPassword: PASSWORD,
        newPassword: 'Nueva-contraseña-2026',
      })
      .expect(204);
    await a.get('/api/auth/me').expect(200);
    await b.get('/api/auth/me').expect(401);
  });
});

describe('invitaciones', () => {
  it('el administrador invita, el invitado acepta con un enlace de un solo uso y queda con el rol', async () => {
    const org = await createOrg(prisma, 'Empresa Invita S.A.S.');
    const admin = await createUser(prisma, org.id, 'ADMINISTRATOR');
    const c = await loggedIn(app, admin.email, org.id);
    const accountant = await prisma.role.findFirstOrThrow({
      where: { key: 'ACCOUNTANT', organizationId: null },
    });
    const email = uniqueEmail('invitado');

    await c.post('/api/users/invitations', { email, roleId: accountant.id }).expect(201);
    const token = tokenFrom(await lastMailTo(email));

    const guest = await new Client(app).init();
    const preview = await guest.get(`/api/auth/invitations/${token}`).expect(200);
    expect(preview.body).toMatchObject({
      email,
      organizationName: 'Empresa Invita S.A.S.',
      roleName: 'Contador',
      existingAccount: false,
    });

    await guest
      .post('/api/auth/accept-invitation', { token, fullName: 'Ana Pérez', password: 'corta' })
      .expect(400);
    const accepted = await guest
      .post('/api/auth/accept-invitation', {
        token,
        fullName: 'Ana Pérez',
        password: 'Contraseña-de-Ana-2026',
      })
      .expect(200);
    expect(accepted.body.memberships[0]).toMatchObject({
      organizationId: org.id,
      role: { key: 'ACCOUNTANT' },
    });
    await guest.get('/api/auth/me').expect(200); // queda con sesión iniciada

    const again = await new Client(app).init();
    await again
      .post('/api/auth/accept-invitation', {
        token,
        fullName: 'X',
        password: 'Contraseña-de-Ana-2026',
      })
      .expect(400);
  });
});
