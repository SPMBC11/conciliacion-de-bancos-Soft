import type { INestApplication } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import XLSX from 'xlsx';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { PrismaService } from '../src/infrastructure/prisma.service.js';
import { DocumentsService } from '../src/modules/documents/documents.service.js';
import { startWorkers } from '../src/workers.js';
import { type Client, createOrg, createTestApp, createUser, loggedIn } from './helpers.js';

let app: INestApplication;
let prisma: PrismaService;
beforeAll(async () => ({ app, prisma } = await createTestApp()));
afterAll(async () => app?.close());

const ansi = (s: string) => Buffer.from([...s].map((c) => c.charCodeAt(0)));

/** Extracto ficticio “Banco Demo A” (CSV ; Windows-1252). `extra` agrega líneas antes del total. */
function bankCsv(lines: string[], header = 'Fecha;Descripción;Referencia;Débito;Crédito;Saldo') {
  return ansi(
    ['BANCO DEMO A - EXTRACTO (DATOS FICTICIOS)', header, ...lines, 'TOTAL;;;;;'].join('\r\n'),
  );
}
const OCT = [
  '01/10/2026;Consignación cliente demo;RC-0001;;1.500.000,00;16.750.000,75',
  '02/10/2026;GMF 4x1000;;6.000,00;;16.744.000,75',
  '02/10/2026;GMF 4x1000;;6.000,00;;16.738.000,75',
  '03/10/2026;Comisión transferencia;ND-10;2.500,00;;16.735.500,75',
];
const BANK_CONFIG = {
  sheetIndex: 0,
  headerRow: 2,
  startRow: 3,
  columns: { date: 0, description: 1, reference: 2, debit: 3, credit: 4, balance: 5 },
  amountMode: 'DEBIT_CREDIT',
  dateFormat: 'DD/MM/YYYY',
  decimalSeparator: ',',
  skipRowPatterns: ['^TOTAL'],
};

async function setup() {
  const org = await createOrg(prisma);
  const owner = await createUser(prisma, org.id, 'OWNER');
  const c = await loggedIn(app, owner.email, org.id);
  await c.post('/api/chart-of-accounts/load-base').expect(201);
  const gl = (
    await prisma.glAccount.findFirstOrThrow({ where: { organizationId: org.id, code: '111005' } })
  ).id;
  const bankId = (
    await prisma.bank.findFirstOrThrow({ where: { name: 'Bancolombia', organizationId: null } })
  ).id;
  const acc = await c
    .post('/api/bank-accounts', {
      bankId,
      name: 'Demo A',
      accountNumber: String(Date.now()).slice(-10),
      type: 'CORRIENTE',
      currency: 'COP',
      glAccountId: gl,
      openingBalance: '15250000.75',
      openingBalanceDate: '2026-09-30',
    })
    .expect(201);
  await c.post('/api/periods', { year: 2026, month: 10 }).expect(201);
  return { org, owner, c, accountId: acc.body.id as string, bankId };
}

const upload = (c: Client, accountId: string, buf: Buffer, name: string, side = 'BANK') =>
  c.agent
    .post('/api/documents/upload')
    .set({ 'x-csrf-token': c.csrf, 'x-organization-id': c.orgId! })
    .field({ bankAccountId: accountId, side, year: '2026', month: '10' })
    .attach('file', buf, name);

const startImport = (c: Client, docId: string, body: object, key = randomUUID()) =>
  c.agent
    .post(`/api/documents/${docId}/import`)
    .set({ 'x-csrf-token': c.csrf, 'x-organization-id': c.orgId!, 'idempotency-key': key })
    .send(body);

/** Ejecuta la importación como lo hace el worker. */
const runWorker = (importId: string, orgId: string) =>
  app.get(DocumentsService).executeImport(importId, orgId, async () => {});

async function bankTemplate(c: Client, docId: string, bankId: string) {
  const t = await c
    .post('/api/import-templates', {
      name: `Banco Demo A ${randomUUID().slice(0, 4)}`,
      side: 'BANK',
      bankId,
      format: 'CSV',
      config: BANK_CONFIG,
      sampleDocumentId: docId,
    })
    .expect(201);
  return t.body.id as string;
}

describe('carga de documentos', () => {
  it('guarda el original, detecta formato y rechaza el mismo archivo dos veces (prueba 12)', async () => {
    const { c, accountId } = await setup();
    const res = await upload(c, accountId, bankCsv(OCT), 'extracto-octubre.csv').expect(201);
    expect(res.body.document).toMatchObject({
      format: 'CSV',
      side: 'BANK',
      fileName: 'extracto-octubre.csv',
      status: 'UPLOADED',
    });
    expect(res.body.document.sha256).toMatch(/^[0-9a-f]{64}$/);
    const again = await upload(c, accountId, bankCsv(OCT), 'copia.csv').expect(409);
    expect(again.body.code).toBe('DOCUMENT_DUPLICATE');
    const dl = await c
      .get(`/api/documents/${res.body.document.id}/download`)
      .buffer(true)
      .parse((r, cb) => {
        const chunks: Buffer[] = [];
        r.on('data', (d: Buffer) => chunks.push(d));
        r.on('end', () => cb(null, Buffer.concat(chunks)));
      })
      .expect(200);
    expect(Buffer.compare(dl.body, bankCsv(OCT))).toBe(0);
    expect(
      await prisma.auditLog.count({
        where: { action: 'DOCUMENT_DOWNLOADED', entityId: res.body.document.id },
      }),
    ).toBe(1);
  });

  it('rechaza PDF (no compatible en v1), binarios y periodos no abiertos', async () => {
    const { c, accountId } = await setup();
    expect(
      (await upload(c, accountId, Buffer.from('%PDF-1.7 ...'), 'e.pdf').expect(400)).body.code,
    ).toBe('FORMAT_NOT_SUPPORTED');
    expect(
      (await upload(c, accountId, Buffer.from([1, 2, 0, 3]), 'e.csv').expect(400)).body.code,
    ).toBe('FILE_TYPE_INVALID');
    const noPeriod = await c.agent
      .post('/api/documents/upload')
      .set({ 'x-csrf-token': c.csrf, 'x-organization-id': c.orgId! })
      .field({ bankAccountId: accountId, side: 'BANK', year: '2026', month: '9' })
      .attach('file', bankCsv(OCT), 'x.csv')
      .expect(400);
    expect(noPeriod.body.code).toBe('PERIOD_NOT_OPEN');
  });
});

describe('plantillas, vista previa e importación', () => {
  it('flujo completo: grilla → plantilla → sugerencia → vista previa → importación con duplicados marcados', async () => {
    const { org, c, accountId, bankId } = await setup();
    const doc = (await upload(c, accountId, bankCsv(OCT), 'oct.csv').expect(201)).body.document;
    const grid = await c.get(`/api/documents/${doc.id}/grid`).expect(200);
    expect(grid.body).toMatchObject({ encoding: 'windows-1252', delimiter: ';' });
    expect(grid.body.sheets[0].rows[1]).toEqual([
      'Fecha',
      'Descripción',
      'Referencia',
      'Débito',
      'Crédito',
      'Saldo',
    ]);

    const templateId = await bankTemplate(c, doc.id, bankId);
    // Un archivo nuevo con el mismo encabezado recibe la plantilla sugerida.
    const other = await upload(
      c,
      accountId,
      bankCsv(['04/10/2026;Intereses;;;100,00;16.735.600,75']),
      'otro.csv',
    ).expect(201);
    expect(other.body.suggestedTemplate.id).toBe(templateId);

    const preview = await c.post(`/api/documents/${doc.id}/preview`, { templateId }).expect(200);
    expect(preview.body).toMatchObject({
      validCount: 4,
      skippedCount: 1,
      errorCount: 0,
      duplicateCount: 1,
      canImport: true,
      requiresJustification: false,
    });
    expect(preview.body.balance).toMatchObject({
      opening: '15250000.75',
      closing: '16735500.75',
      balanced: true,
    });
    expect(preview.body.warnings.map((w: { code: string }) => w.code)).toContain(
      'POSSIBLE_DUPLICATES',
    );

    await c.post(`/api/documents/${doc.id}/import`, { templateId }).expect(400); // sin Idempotency-Key
    const key = randomUUID();
    const started = await startImport(c, doc.id, { templateId }, key).expect(202);
    expect((await startImport(c, doc.id, { templateId }, key).expect(202)).body.importId).toBe(
      started.body.importId,
    ); // idempotente
    await runWorker(started.body.importId, org.id);

    const status = await c.get(`/api/document-imports/${started.body.importId}`).expect(200);
    expect(status.body).toMatchObject({
      status: 'COMPLETED',
      progress: 100,
      importedCount: 4,
      skippedCount: 1,
      duplicateCount: 1,
      balanced: true,
      openingBalance: '15250000.75',
    });
    const txs = await c.get(`/api/transactions?side=BANK&documentId=${doc.id}`).expect(200);
    expect(txs.body.data.map((t: { amount: string }) => t.amount)).toEqual([
      '1500000.00',
      '-6000.00',
      '-6000.00',
      '-2500.00',
    ]);
    // Prueba 5: el segundo GMF idéntico queda como posible duplicado del primero, sin eliminar ninguno.
    const [, gmf1, gmf2] = txs.body.data;
    expect(gmf2).toMatchObject({ duplicateStatus: 'POSSIBLE', duplicateOfId: gmf1.id });
    expect(gmf1.duplicateStatus).toBe('NONE');
    // Trazabilidad: fila de origen con dato crudo y normalizado.
    const row = await prisma.documentRow.findUniqueOrThrow({ where: { id: gmf2.documentRowId } });
    expect(row).toMatchObject({ rowNumber: 5, status: 'OK' });
    expect(row.raw).toEqual(['02/10/2026', 'GMF 4x1000', null, '6.000,00', null, '16.738.000,75']);

    await startImport(c, doc.id, { templateId }).expect(409); // ya importado
    // El usuario decide: es legítimo (dos GMF el mismo día).
    await c
      .post(`/api/transactions/${gmf2.id}/duplicate-decision`, {
        side: 'BANK',
        decision: 'DISMISSED',
      })
      .expect(200);
  });

  it('prueba 13: saldos que no cuadran exigen justificación, que queda en auditoría', async () => {
    const { org, c, accountId, bankId } = await setup();
    // Saldo corrido manipulado en la última fila: no cuadra.
    const bad = bankCsv([
      ...OCT.slice(0, 3),
      '03/10/2026;Comisión transferencia;ND-10;2.500,00;;16.700.000,00',
    ]);
    const doc = (await upload(c, accountId, bad, 'malo.csv').expect(201)).body.document;
    const templateId = await bankTemplate(c, doc.id, bankId);
    const preview = await c.post(`/api/documents/${doc.id}/preview`, { templateId }).expect(200);
    expect(preview.body).toMatchObject({ requiresJustification: true, canImport: true });
    expect(preview.body.balance.balanced).toBe(false);
    expect((await startImport(c, doc.id, { templateId }).expect(400)).body.code).toBe(
      'JUSTIFICATION_REQUIRED',
    );
    const ok = await startImport(c, doc.id, {
      templateId,
      justification: 'El banco corrigió el saldo en el extracto siguiente.',
    }).expect(202);
    await runWorker(ok.body.importId, org.id);
    const imp = await prisma.documentImport.findUniqueOrThrow({ where: { id: ok.body.importId } });
    expect(imp).toMatchObject({
      status: 'COMPLETED',
      balanced: false,
      justification: 'El banco corrigió el saldo en el extracto siguiente.',
    });
    expect(
      await prisma.auditLog.count({
        where: { action: 'DOCUMENT_IMPORTED', entityId: doc.id, reason: { contains: 'corrigió' } },
      }),
    ).toBe(1);
  });

  it('auxiliar contable XLSX sin columna de saldo: exige saldos y el débito es entrada', async () => {
    const { org, c, accountId } = await setup();
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(
      wb,
      XLSX.utils.aoa_to_sheet([
        ['Fecha', 'Comprobante', 'Tercero', 'NIT', 'Detalle', 'Débito', 'Crédito'],
        [46296, 'RC-0001', 'Cliente Demo SAS', '900111222', 'Recaudo factura 10', 1500000, 0],
        [46297, 'CE-0042', 'Proveedor Demo', '800333444', 'Pago proveedor', 0, 2350000.5],
      ]),
      'Aux',
    );
    const buf = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' }) as Buffer;
    const doc = (await upload(c, accountId, buf, 'auxiliar.xlsx', 'BOOK').expect(201)).body
      .document;
    const t = await c
      .post('/api/import-templates', {
        name: 'Auxiliar ERP demo',
        side: 'BOOK',
        software: 'ERP Demo',
        format: 'XLSX',
        sampleDocumentId: doc.id,
        config: {
          sheetIndex: 0,
          headerRow: 1,
          startRow: 2,
          columns: {
            date: 0,
            documentNumber: 1,
            thirdParty: 2,
            thirdPartyNit: 3,
            description: 4,
            debit: 5,
            credit: 6,
          },
          amountMode: 'DEBIT_CREDIT',
          dateFormat: 'DD/MM/YYYY',
          decimalSeparator: ',',
        },
      })
      .expect(201);
    const p1 = await c
      .post(`/api/documents/${doc.id}/preview`, { templateId: t.body.id })
      .expect(200);
    expect(p1.body).toMatchObject({ needsBalances: true, canImport: false });
    const p2 = await c
      .post(`/api/documents/${doc.id}/preview`, {
        templateId: t.body.id,
        openingBalance: '10000000.00',
        closingBalance: '9149999.50',
      })
      .expect(200);
    expect(p2.body).toMatchObject({
      needsBalances: false,
      canImport: true,
      balance: { balanced: true },
    });
    const imp = await startImport(c, doc.id, {
      templateId: t.body.id,
      openingBalance: '10000000.00',
      closingBalance: '9149999.50',
    }).expect(202);
    await runWorker(imp.body.importId, org.id);
    const txs = await c.get(`/api/transactions?side=BOOK&documentId=${doc.id}`).expect(200);
    expect(
      txs.body.data.map((x: { amount: string; thirdPartyNit: string }) => [
        x.amount,
        x.thirdPartyNit,
      ]),
    ).toEqual([
      ['1500000.00', '900111222'],
      ['-2350000.50', '800333444'],
    ]);
  });

  it('OFX sin plantilla; un movimiento ya importado en otro archivo queda como posible duplicado', async () => {
    const { org, c, accountId, bankId } = await setup();
    const csvDoc = (await upload(c, accountId, bankCsv(OCT.slice(0, 1)), 'a.csv').expect(201)).body
      .document;
    const templateId = await bankTemplate(c, csvDoc.id, bankId);
    const i1 = await startImport(c, csvDoc.id, { templateId }).expect(202);
    await runWorker(i1.body.importId, org.id);

    const ofx = Buffer.from(`OFXHEADER:100
<OFX><CURDEF>COP<BANKTRANLIST>
<STMTTRN><DTPOSTED>20261001<TRNAMT>1500000.00<FITID>X1<NAME>Consignación cliente demo<REFNUM>RC-0001
<STMTTRN><DTPOSTED>20261005<TRNAMT>-250000.00<FITID>X2<NAME>Cheque<CHECKNUM>123
</BANKTRANLIST><LEDGERBAL><BALAMT>16500000.75</LEDGERBAL></OFX>`);
    const doc = (await upload(c, accountId, ofx, 'oct.ofx').expect(201)).body.document;
    expect(doc.format).toBe('OFX');
    const p = await c
      .post(`/api/documents/${doc.id}/preview`, { openingBalance: '15250000.75' })
      .expect(200);
    expect(p.body).toMatchObject({ validCount: 2, duplicateCount: 1, balance: { balanced: true } });
    const imp = await startImport(c, doc.id, { openingBalance: '15250000.75' }).expect(202);
    await runWorker(imp.body.importId, org.id);
    const txs = (await c.get(`/api/transactions?side=BANK&documentId=${doc.id}`).expect(200)).body
      .data;
    const first = (await c.get(`/api/transactions?side=BANK&documentId=${csvDoc.id}`).expect(200))
      .body.data[0];
    expect(txs[0]).toMatchObject({
      externalId: 'X1',
      duplicateStatus: 'POSSIBLE',
      duplicateOfId: first.id,
    });
    expect(txs[1]).toMatchObject({
      documentNumber: '123',
      amount: '-250000.00',
      duplicateStatus: 'NONE',
    });
  });

  it('las plantillas se versionan; la importación conserva la versión usada', async () => {
    const { c, accountId, bankId } = await setup();
    const doc = (await upload(c, accountId, bankCsv(OCT), 'v.csv').expect(201)).body.document;
    const templateId = await bankTemplate(c, doc.id, bankId);
    const v2 = await c
      .patch(`/api/import-templates/${templateId}`, {
        config: { ...BANK_CONFIG, skipRowPatterns: ['^TOTAL', 'SALDO ANTERIOR'] },
      })
      .expect(200);
    expect(v2.body.currentVersion).toBe(2);
    const full = await c.get(`/api/import-templates/${templateId}`).expect(200);
    expect(full.body.versions.map((v: { version: number }) => v.version)).toEqual([2, 1]);
  });
});

describe('worker real (BullMQ)', () => {
  it('la API encola y el worker procesa la importación hasta COMPLETED', async () => {
    const { c, accountId, bankId } = await setup();
    const workers = startWorkers(app);
    try {
      const doc = (await upload(c, accountId, bankCsv(OCT), 'cola.csv').expect(201)).body.document;
      const imp = await startImport(c, doc.id, {
        templateId: await bankTemplate(c, doc.id, bankId),
      }).expect(202);
      let status = '';
      for (let i = 0; i < 100 && status !== 'COMPLETED' && status !== 'FAILED'; i++) {
        await new Promise((r) => setTimeout(r, 100));
        status = (await c.get(`/api/document-imports/${imp.body.importId}`).expect(200)).body
          .status;
      }
      expect(status).toBe('COMPLETED');
      const log = await prisma.auditLog.findFirstOrThrow({
        where: { action: 'DOCUMENT_IMPORTED', entityId: doc.id },
      });
      expect(log.source).toBe('WORKER');
    } finally {
      await Promise.all(workers.map((w) => w.close()));
    }
  });
});

describe('integridad y aislamiento', () => {
  it('los movimientos importados no se modifican ni se eliminan (BD)', async () => {
    const { org, c, accountId, bankId } = await setup();
    const doc = (await upload(c, accountId, bankCsv(OCT.slice(0, 1)), 'i.csv').expect(201)).body
      .document;
    const imp = await startImport(c, doc.id, {
      templateId: await bankTemplate(c, doc.id, bankId),
    }).expect(202);
    await runWorker(imp.body.importId, org.id);
    const tx = await prisma.bankTransaction.findFirstOrThrow({ where: { documentId: doc.id } });
    await expect(
      prisma.bankTransaction.update({ where: { id: tx.id }, data: { amount: '1.00' } }),
    ).rejects.toThrow(/no se modifican/);
    await expect(prisma.bankTransaction.delete({ where: { id: tx.id } })).rejects.toThrow(
      /no se eliminan/,
    );
  });

  it('prueba 24: otra organización no accede a documentos y el worker ignora trabajos de otra organización', async () => {
    const a = await setup();
    const doc = (await upload(a.c, a.accountId, bankCsv(OCT.slice(0, 1)), 'p.csv').expect(201)).body
      .document;
    const imp = await startImport(a.c, doc.id, {
      templateId: await bankTemplate(a.c, doc.id, a.bankId),
    }).expect(202);
    const b = await setup();
    await b.c.get(`/api/documents/${doc.id}`).expect(404);
    await b.c.get(`/api/documents/${doc.id}/download`).expect(404);
    await b.c.get(`/api/document-imports/${imp.body.importId}`).expect(404);
    expect((await b.c.get('/api/document-imports').expect(200)).body).toEqual([]);
    expect(await runWorker(imp.body.importId, b.org.id)).toEqual({ skipped: true });
    expect(
      (await prisma.documentImport.findUniqueOrThrow({ where: { id: imp.body.importId } })).status,
    ).toBe('QUEUED');
  });
});
