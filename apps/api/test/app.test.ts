import 'reflect-metadata';
import { Test } from '@nestjs/testing';
import type { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { HealthResponse, ApiError } from '@finagent/contracts';
import { AppModule } from '../src/app.module.js';
import { configureApp } from '../src/bootstrap.js';
import { PrismaService } from '../src/infrastructure/prisma.service.js';

// Requiere la infraestructura local: `npm run infra:up`.
describe('API (integración)', () => {
  let app: INestApplication;
  let prisma: PrismaService;

  beforeAll(async () => {
    const mod = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = configureApp(mod.createNestApplication({ bufferLogs: true }));
    await app.init();
    prisma = app.get(PrismaService);
  });

  afterAll(async () => {
    await app?.close();
  });

  it('GET /api/health informa todas las dependencias arriba', async () => {
    const res = await request(app.getHttpServer()).get('/api/health').expect(200);
    const body = HealthResponse.parse(res.body);
    expect(body.checks).toEqual({ database: 'up', redis: 'up', storage: 'up' });
    expect(res.headers['x-correlation-id']).toBeTruthy();
  });

  it('los errores usan el formato único en español con correlation ID', async () => {
    const res = await request(app.getHttpServer())
      .get('/api/no-existe')
      .set('x-correlation-id', 'test-123')
      .expect(404);
    expect(ApiError.parse(res.body)).toEqual({
      code: 'NOT_FOUND',
      message: 'El recurso no existe.',
      correlationId: 'test-123',
    });
  });

  it('audit_logs es solo de inserción: UPDATE y DELETE se rechazan en la BD', async () => {
    const log = await prisma.auditLog.create({
      data: { action: 'TEST', entity: 'test', source: 'SYSTEM' },
    });
    await expect(
      prisma.auditLog.update({ where: { id: log.id }, data: { action: 'HACK' } }),
    ).rejects.toThrow(/solo de inserción/);
    await expect(prisma.auditLog.delete({ where: { id: log.id } })).rejects.toThrow(
      /solo de inserción/,
    );
    expect((await prisma.auditLog.findUnique({ where: { id: log.id } }))?.action).toBe('TEST');
  });
});
