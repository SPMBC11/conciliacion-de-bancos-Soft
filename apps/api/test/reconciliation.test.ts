import type { INestApplication } from '@nestjs/common';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { PrismaService } from '../src/infrastructure/prisma.service.js';
import { randomUUID } from 'node:crypto';
import { type Client, createOrg, createTestApp, createUser, loggedIn } from './helpers.js';

let app: INestApplication;
let prisma: PrismaService;

beforeAll(async () => ({ app, prisma } = await createTestApp()));
afterAll(async () => app?.close());

async function setup() {
  const org = await createOrg(prisma);
  const user = await createUser(prisma, org.id, 'OWNER');
  const client = await loggedIn(app, user.email, org.id);
  await client.post('/api/chart-of-accounts/load-base').expect(201);
  const glAccountId = (
    await prisma.glAccount.findFirstOrThrow({ where: { organizationId: org.id, code: '111005' } })
  ).id;
  const bankId = (
    await prisma.bank.findFirstOrThrow({ where: { organizationId: null, name: 'Bancolombia' } })
  ).id;
  const account = await client
    .post('/api/bank-accounts', {
      bankId,
      name: 'Cuenta motor de prueba',
      accountNumber: '1234567890',
      type: 'CORRIENTE',
      currency: 'COP',
      glAccountId,
      openingBalance: '0.00',
      openingBalanceDate: '2026-09-30',
    })
    .expect(201);
  const period = await client.post('/api/periods', { year: 2026, month: 10 }).expect(201);
  return {
    org,
    user,
    client,
    accountId: account.body.id as string,
    periodId: period.body.id as string,
  };
}

function runRequest(client: Client, accountId: string, periodId: string, key: string) {
  return client.agent
    .post('/api/reconciliations/runs')
    .set({
      'x-csrf-token': client.csrf,
      'x-organization-id': client.orgId!,
      'idempotency-key': key,
    })
    .send({ bankAccountId: accountId, periodId });
}

async function createTransaction(
  ctx: Awaited<ReturnType<typeof setup>>,
  side: 'BANK' | 'BOOK',
  amount: string,
) {
  const tag = randomUUID();
  const document = await prisma.document.create({
    data: {
      organizationId: ctx.org.id,
      bankAccountId: ctx.accountId,
      periodId: ctx.periodId,
      side,
      fileName: `${side}-${tag}.csv`,
      format: 'CSV',
      sizeBytes: 100,
      sha256: tag.replaceAll('-', '').padEnd(64, '0').slice(0, 64),
      storageKey: `test/${tag}`,
      uploadedBy: ctx.user.id,
    },
  });
  const imported = await prisma.documentImport.create({
    data: {
      documentId: document.id,
      idempotencyKey: `test-${tag}`,
      createdBy: ctx.user.id,
      status: 'COMPLETED',
    },
  });
  const row = await prisma.documentRow.create({
    data: { importId: imported.id, rowNumber: 2, raw: { date: '2026-10-05' }, status: 'OK' },
  });
  const data = {
    organizationId: ctx.org.id,
    bankAccountId: ctx.accountId,
    periodId: ctx.periodId,
    documentId: document.id,
    documentRowId: row.id,
    operationDate: new Date('2026-10-05T00:00:00.000Z'),
    descriptionOriginal: 'PAGO FACTURA 100',
    descriptionNormalized: 'PAGO FACTURA 100',
    reference: 'FAC-100',
    amount,
    currency: 'COP',
    contentFingerprint: tag.replaceAll('-', '').padEnd(64, '0').slice(0, 64),
    sourceFingerprint: randomUUID().replaceAll('-', '').padEnd(64, '0').slice(0, 64),
  };
  return side === 'BANK'
    ? prisma.bankTransaction.create({ data })
    : prisma.accountingTransaction.create({ data });
}

describe('motor de conciliación API', () => {
  it('versiona reglas y conserva valores monetarios como texto decimal', async () => {
    const { client } = await setup();
    const initial = await client.get('/api/reconciliations/rules').expect(200);
    expect(initial.body).toMatchObject({
      version: 1,
      dateToleranceBusinessDays: 3,
      amountTolerance: '1000.00',
      maxGroupSize: 6,
    });

    const changed = await client.agent
      .put('/api/reconciliations/rules')
      .set({ 'x-csrf-token': client.csrf, 'x-organization-id': client.orgId! })
      .send({
        dateToleranceBusinessDays: 2,
        amountTolerance: '500.00',
        amountToleranceBasisPoints: 10,
        maxGroupSize: 5,
      })
      .expect(200);
    expect(changed.body).toMatchObject({
      version: 2,
      dateToleranceBusinessDays: 2,
      amountTolerance: '500.00',
      maxGroupSize: 5,
    });
    expect((await client.get('/api/reconciliations/rules').expect(200)).body.version).toBe(2);
  });

  it('crea ejecuciones idempotentes y no expone otra organización', async () => {
    const firstOrg = await setup();
    const key = `run-${firstOrg.org.id.slice(0, 8)}-oct`;
    const first = await runRequest(
      firstOrg.client,
      firstOrg.accountId,
      firstOrg.periodId,
      key,
    ).expect(201);
    expect(first.body).toMatchObject({
      bankTransactionCount: 0,
      bookTransactionCount: 0,
      suggestionCount: 0,
    });
    const retry = await runRequest(
      firstOrg.client,
      firstOrg.accountId,
      firstOrg.periodId,
      key,
    ).expect(201);
    expect(retry.body.id).toBe(first.body.id);

    const otherOrg = await setup();
    await otherOrg.client.get(`/api/reconciliations/runs/${first.body.id}`).expect(404);
  });

  it('protege la conciliación concurrente, permite reversión y vuelve a mostrar la partida', async () => {
    const ctx = await setup();
    await createTransaction(ctx, 'BANK', '-100.00');
    await createTransaction(ctx, 'BOOK', '100.00');
    const run = await runRequest(
      ctx.client,
      ctx.accountId,
      ctx.periodId,
      `concurrent-${ctx.org.id.slice(0, 8)}`,
    ).expect(201);
    const summary = await ctx.client
      .get(`/api/reconciliations/runs/${run.body.id}/summary`)
      .expect(200);
    expect(summary.body).toMatchObject({
      bank: { movementCount: 1, pendingMovementCount: 1, movementNet: '-100.00' },
      book: { movementCount: 1, pendingMovementCount: 1, movementNet: '100.00' },
      movementDifference: '0.00',
    });
    const page = await ctx.client
      .get(`/api/reconciliations/runs/${run.body.id}/suggestions?page=1&pageSize=20`)
      .expect(200);
    expect(page.body.total).toBe(1);
    const suggestionId = page.body.data[0].id as string;
    expect(page.body.data[0]).toMatchObject({ status: 'EXACT', reviewStatus: 'OPEN' });

    const responses = await Promise.all([
      ctx.client.post(`/api/reconciliations/suggestions/${suggestionId}/confirm`, {
        reason: 'Coincidencia revisada',
      }),
      ctx.client.post(`/api/reconciliations/suggestions/${suggestionId}/confirm`, {
        reason: 'Coincidencia revisada',
      }),
    ]);
    expect(responses.map((response) => response.status).sort()).toEqual([200, 409]);
    const matches = await ctx.client
      .get(`/api/reconciliations/runs/${run.body.id}/matches`)
      .expect(200);
    expect(matches.body).toHaveLength(1);
    const matchId = matches.body[0].id as string;

    await ctx.client
      .post(`/api/reconciliations/matches/${matchId}/reverse`, {
        reason: 'Revisión detectó asociación incorrecta',
      })
      .expect(200);
    const unmatched = await ctx.client
      .get(`/api/reconciliations/runs/${run.body.id}/transactions?side=BANK&page=1&pageSize=20`)
      .expect(200);
    expect(unmatched.body.total).toBe(1);
    const revertedSummary = await ctx.client
      .get(`/api/reconciliations/runs/${run.body.id}/summary`)
      .expect(200);
    expect(
      revertedSummary.body.bank.pendingMovementCount +
        revertedSummary.body.book.pendingMovementCount,
    ).toBe(2);
  });

  it('valida asientos cuadrados y exige la secuencia de revisión antes del snapshot', async () => {
    const ctx = await setup();
    const run = await runRequest(
      ctx.client,
      ctx.accountId,
      ctx.periodId,
      `closing-${ctx.org.id.slice(0, 8)}`,
    ).expect(201);
    const record = await ctx.client
      .post('/api/reconciliations/records', { runId: run.body.id })
      .expect(201);
    const expense = await prisma.glAccount.findFirstOrThrow({
      where: { organizationId: ctx.org.id, code: '530515' },
    });
    const bank = await prisma.glAccount.findFirstOrThrow({
      where: { organizationId: ctx.org.id, code: '111005' },
    });
    const entry = await ctx.client
      .post('/api/reconciliations/adjustments', {
        reconciliationId: record.body.id,
        entryDate: '2026-10-31',
        description: 'Registro de comisión bancaria',
        currency: 'COP',
        lines: [
          { glAccountId: expense.id, debit: '500.00', credit: '0.00' },
          { glAccountId: bank.id, debit: '0.00', credit: '500.00' },
        ],
      })
      .expect(201);
    await ctx.client.post(`/api/reconciliations/adjustments/${entry.body.id}/approve`).expect(200);
    await ctx.client
      .post(`/api/reconciliations/records/${record.body.id}/submit`, {
        reason: 'Conciliación preparada y soportes revisados',
      })
      .expect(200);
    await ctx.client
      .post(`/api/reconciliations/records/${record.body.id}/review`, {
        reason: 'Soportes verificados contra extracto',
      })
      .expect(200);
    await ctx.client
      .post(`/api/reconciliations/records/${record.body.id}/approve`, {
        reason: 'Aprobación contable del periodo',
      })
      .expect(200);
    const closed = await ctx.client
      .post(`/api/reconciliations/records/${record.body.id}/close`, {
        reason: 'Cierre mensual autorizado',
      })
      .expect(200);
    expect(closed.body).toMatchObject({ status: 'CLOSED', version: 5 });
    expect(closed.body.snapshot.adjustments).toEqual({ debit: '500.00', credit: '500.00' });
    const report = await ctx.client.get(`/api/reconciliations/reports/${run.body.id}`).expect(200);
    expect(report.body).toMatchObject({
      summary: {
        bank: { movementCount: 0 },
        book: { movementCount: 0 },
        movementDifference: '0.00',
      },
      run: { id: run.body.id },
    });
    await ctx.client.agent
      .get(`/api/reconciliations/reports/${run.body.id}/export?format=csv`)
      .set({ 'x-csrf-token': ctx.client.csrf, 'x-organization-id': ctx.client.orgId! })
      .expect(200)
      .expect('content-type', /text\/csv/);
  });
});
