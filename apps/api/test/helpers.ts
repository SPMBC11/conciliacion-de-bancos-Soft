import 'reflect-metadata';
import { randomUUID } from 'node:crypto';
import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import argon2 from 'argon2';
import request from 'supertest';
import TestAgent from 'supertest/lib/agent.js';
import { CSRF_HEADER, ORG_HEADER, type SystemRoleKey } from '@finagent/contracts';
import { AppModule } from '../src/app.module.js';
import { configureApp } from '../src/bootstrap.js';
import { PrismaService } from '../src/infrastructure/prisma.service.js';

export const PASSWORD = 'Contraseña-segura-2026';

export async function createTestApp() {
  const mod = await Test.createTestingModule({ imports: [AppModule] }).compile();
  const app = configureApp(mod.createNestApplication({ bufferLogs: true }));
  await app.init();
  return { app, prisma: app.get(PrismaService) };
}

export const uniqueEmail = (tag: string) =>
  `${tag}-${randomUUID().slice(0, 8)}@test.finagent.local`;

export async function createOrg(prisma: PrismaService, name = 'Empresa Prueba S.A.S.') {
  return prisma.organization.create({
    data: {
      nit: `9${randomUUID().replace(/\D/g, '').slice(0, 8)}-${Math.floor(Math.random() * 10)}`,
      legalName: name,
    },
  });
}

export async function createUser(
  prisma: PrismaService,
  orgId: string | null,
  roleKey: SystemRoleKey,
  email = uniqueEmail(roleKey.toLowerCase()),
) {
  const user = await prisma.user.create({
    data: {
      email,
      fullName: `Usuario ${roleKey}`,
      passwordHash: await argon2.hash(PASSWORD),
      status: 'ACTIVE',
    },
  });
  if (orgId) {
    const role = await prisma.role.findFirstOrThrow({
      where: { key: roleKey, organizationId: null },
    });
    await prisma.organizationMember.create({
      data: { organizationId: orgId, userId: user.id, roleId: role.id },
    });
  }
  return user;
}

/** Cliente con cookies persistentes y token CSRF, como el navegador. */
export class Client {
  readonly agent: TestAgent;
  csrf = '';
  orgId?: string;

  constructor(app: INestApplication) {
    this.agent = request.agent(app.getHttpServer());
  }

  async init() {
    const res = await this.agent.get('/api/auth/csrf').expect(200);
    this.csrf = res.body.csrfToken;
    return this;
  }

  private headers() {
    return { [CSRF_HEADER]: this.csrf, ...(this.orgId && { [ORG_HEADER]: this.orgId }) };
  }

  get(url: string) {
    return this.agent.get(url).set(this.headers());
  }
  post(url: string, body?: object) {
    return this.agent.post(url).set(this.headers()).send(body);
  }
  patch(url: string, body?: object) {
    return this.agent.patch(url).set(this.headers()).send(body);
  }
  delete(url: string) {
    return this.agent.delete(url).set(this.headers());
  }

  login(email: string, password = PASSWORD) {
    return this.post('/api/auth/login', { email, password });
  }
}

export async function loggedIn(app: INestApplication, email: string, orgId?: string) {
  const c = await new Client(app).init();
  await c.login(email).expect(200);
  c.orgId = orgId;
  return c;
}

/** Último correo recibido en Mailpit para un destinatario. */
export async function lastMailTo(email: string): Promise<string> {
  for (let i = 0; i < 20; i++) {
    const res = await fetch(
      `http://localhost:8025/api/v1/search?query=${encodeURIComponent(`to:${email}`)}`,
    );
    const { messages } = (await res.json()) as { messages: { ID: string }[] };
    if (messages[0]) {
      const msg = await fetch(`http://localhost:8025/api/v1/message/${messages[0].ID}`);
      return ((await msg.json()) as { Text: string }).Text;
    }
    await new Promise((r) => setTimeout(r, 100));
  }
  throw new Error(`No llegó correo a ${email}`);
}

export const tokenFrom = (text: string) => /token=([\w-]+)/.exec(text)?.[1] ?? '';
