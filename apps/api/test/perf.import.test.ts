import { randomUUID } from 'node:crypto';
import type { INestApplication } from '@nestjs/common';
import { afterAll, beforeAll, expect, it } from 'vitest';
import type { PrismaService } from '../src/infrastructure/prisma.service.js';
import { DocumentsService } from '../src/modules/documents/documents.service.js';
import { createOrg, createTestApp, createUser, loggedIn } from './helpers.js';

// Rendimiento: 50.000 movimientos. Se ejecuta solo con PERF=1 (npm run test:perf).
let app: INestApplication;
let prisma: PrismaService;
beforeAll(async () => ({ app, prisma } = await createTestApp()));
afterAll(async () => app?.close());

it.runIf(process.env.PERF === '1')('importa 50.000 movimientos', { timeout: 300_000 }, async () => {
  const org = await createOrg(prisma);
  const owner = await createUser(prisma, org.id, 'OWNER');
  const c = await loggedIn(app, owner.email, org.id);
  await c.post('/api/chart-of-accounts/load-base').expect(201);
  const gl = (
    await prisma.glAccount.findFirstOrThrow({ where: { organizationId: org.id, code: '111005' } })
  ).id;
  const bankId = (await prisma.bank.findFirstOrThrow({ where: { organizationId: null } })).id;
  const acc = await c
    .post('/api/bank-accounts', {
      bankId,
      name: 'Perf',
      accountNumber: String(Date.now()).slice(-10),
      type: 'CORRIENTE',
      currency: 'COP',
      glAccountId: gl,
      openingBalance: '0',
      openingBalanceDate: '2026-09-30',
    })
    .expect(201);
  await c.post('/api/periods', { year: 2026, month: 10 }).expect(201);

  let balance = 10_000_000_000_00n; // saldo alto: el archivo de prueba nunca queda negativo
  const lines = ['Fecha;Descripción;Referencia;Débito;Crédito;Saldo'];
  const fmt = (cents: bigint) => `${cents / 100n},${String(cents % 100n).padStart(2, '0')}`;
  for (let i = 0; i < 50_000; i++) {
    const amt = BigInt(1000 + (i % 977) * 13) * 100n + BigInt(i % 100);
    const credit = i % 3 === 0;
    balance += credit ? amt : -amt;
    lines.push(
      `${String((i % 28) + 1).padStart(2, '0')}/10/2026;Movimiento ${i};REF-${i};${credit ? '' : fmt(amt)};${credit ? fmt(amt) : ''};${fmt(balance)}`,
    );
  }
  const buf = Buffer.from(lines.join('\n'));
  let t = Date.now();
  const doc = (
    await c.agent
      .post('/api/documents/upload')
      .set({ 'x-csrf-token': c.csrf, 'x-organization-id': org.id })
      .field({ bankAccountId: acc.body.id, side: 'BANK', year: '2026', month: '10' })
      .attach('file', buf, 'perf.csv')
      .expect(201)
  ).body.document;
  const tpl = await c
    .post('/api/import-templates', {
      name: 'Perf',
      side: 'BANK',
      format: 'CSV',
      config: {
        sheetIndex: 0,
        headerRow: 1,
        startRow: 2,
        columns: { date: 0, description: 1, reference: 2, debit: 3, credit: 4, balance: 5 },
        amountMode: 'DEBIT_CREDIT',
        dateFormat: 'DD/MM/YYYY',
        decimalSeparator: ',',
      },
    })
    .expect(201);
  const preview = await c
    .post(`/api/documents/${doc.id}/preview`, { templateId: tpl.body.id })
    .expect(200);
  const tPreview = Date.now() - t;
  expect(preview.body.validCount).toBe(50_000);
  t = Date.now();
  const imp = await c.agent
    .post(`/api/documents/${doc.id}/import`)
    .set({ 'x-csrf-token': c.csrf, 'x-organization-id': org.id, 'idempotency-key': randomUUID() })
    .send({ templateId: tpl.body.id })
    .expect(202);
  await app.get(DocumentsService).executeImport(imp.body.importId, org.id, async () => {});
  const tImport = Date.now() - t;
  const done = await prisma.documentImport.findUniqueOrThrow({ where: { id: imp.body.importId } });
  console.log(
    `PERF carga+vista previa: ${tPreview} ms · importación: ${tImport} ms · estado ${done.status} · ${done.importedCount} movimientos`,
  );
  expect(done.importedCount).toBe(50_000);
});
