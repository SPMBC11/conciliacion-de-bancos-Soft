import type { INestApplication } from '@nestjs/common';
import XLSX from 'xlsx';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { CryptoService } from '../src/infrastructure/crypto.service.js';
import type { PrismaService } from '../src/infrastructure/prisma.service.js';
import { type Client, createOrg, createTestApp, createUser, loggedIn } from './helpers.js';

let app: INestApplication;
let prisma: PrismaService;

beforeAll(async () => ({ app, prisma } = await createTestApp()));
afterAll(async () => app?.close());

/** Organización con PUC base cargado y un Propietario con sesión. */
async function setup() {
  const org = await createOrg(prisma);
  const owner = await createUser(prisma, org.id, 'OWNER');
  const c = await loggedIn(app, owner.email, org.id);
  await c.post('/api/chart-of-accounts/load-base').expect(201);
  const gl = async (code: string) =>
    (await prisma.glAccount.findFirstOrThrow({ where: { organizationId: org.id, code } })).id;
  const bankId = (
    await prisma.bank.findFirstOrThrow({ where: { name: 'Bancolombia', organizationId: null } })
  ).id;
  return { org, owner, c, gl, bankId };
}

function xlsx(rows: unknown[][]) {
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(rows), 'PUC');
  return XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' }) as Buffer;
}

const upload = (c: Client, buf: Buffer, name: string, dryRun = false) =>
  c.agent
    .post(`/api/chart-of-accounts/import${dryRun ? '?dryRun=true' : ''}`)
    .set({ 'x-csrf-token': c.csrf, 'x-organization-id': c.orgId! })
    .attach('file', buf, name);

describe('cifrado de datos sensibles', () => {
  it('AES-256-GCM: ida y vuelta, nonce distinto y detección de manipulación', () => {
    const crypto = app.get(CryptoService);
    const a = crypto.encrypt('1234567890');
    expect(crypto.decrypt(a)).toBe('1234567890');
    expect(crypto.encrypt('1234567890')).not.toBe(a);
    const [v, iv, tag, data] = a.split(':');
    const tampered = [
      v,
      iv,
      tag,
      Buffer.from('0' + Buffer.from(data!, 'base64').toString('hex'), 'hex').toString('base64'),
    ].join(':');
    expect(() => crypto.decrypt(tampered)).toThrow();
    expect(crypto.hmac('1234567890')).toBe(crypto.hmac('1234567890'));
  });
});

describe('cuentas bancarias', () => {
  it('crea con número cifrado, lo muestra enmascarado y conserva el saldo exacto', async () => {
    const { org, c, gl, bankId } = await setup();
    const res = await c
      .post('/api/bank-accounts', {
        bankId,
        name: 'Corriente principal',
        accountNumber: '123-456-7890',
        type: 'CORRIENTE',
        currency: 'COP',
        glAccountId: await gl('111005'),
        openingBalance: '15250000.75',
        openingBalanceDate: '2026-09-30',
      })
      .expect(201);
    expect(res.body).toMatchObject({
      maskedNumber: '****7890',
      openingBalance: '15250000.75',
      openingBalanceDate: '2026-09-30',
    });
    expect(JSON.stringify(res.body)).not.toContain('1234567890');

    const row = await prisma.bankAccount.findFirstOrThrow({ where: { organizationId: org.id } });
    expect(row.accountNumberEnc).not.toContain('1234567890');
    expect(row.accountNumberHmac).not.toContain('1234567890');

    const list = await c.get('/api/bank-accounts').expect(200);
    expect(list.body).toHaveLength(1);
    expect(JSON.stringify(list.body)).not.toContain('1234567890');

    const revealed = await c.post(`/api/bank-accounts/${row.id}/reveal-number`).expect(200);
    expect(revealed.body.accountNumber).toBe('1234567890');
    expect(
      await prisma.auditLog.count({
        where: { action: 'BANK_ACCOUNT_NUMBER_REVEALED', entityId: row.id },
      }),
    ).toBe(1);
  });

  it('rechaza duplicados y cuentas contables que no son de disponible o no aceptan movimiento', async () => {
    const { c, gl, bankId } = await setup();
    const base = {
      bankId,
      name: 'Ahorros',
      accountNumber: '9988776655',
      type: 'AHORROS',
      currency: 'COP',
      openingBalance: '0',
      openingBalanceDate: '2026-09-30',
    };
    const wrong = await c
      .post('/api/bank-accounts', { ...base, glAccountId: await gl('530505') })
      .expect(400);
    expect(wrong.body.code).toBe('GL_ACCOUNT_NOT_CASH');
    const notPostable = await c
      .post('/api/bank-accounts', { ...base, glAccountId: await gl('1110') })
      .expect(400);
    expect(notPostable.body.code).toBe('GL_ACCOUNT_NOT_POSTABLE');
    await c.post('/api/bank-accounts', { ...base, glAccountId: await gl('112005') }).expect(201);
    const dup = await c
      .post('/api/bank-accounts', {
        ...base,
        accountNumber: '99 8877 6655',
        glAccountId: await gl('112005'),
      })
      .expect(409);
    expect(dup.body.code).toBe('BANK_ACCOUNT_EXISTS');
    await c
      .post('/api/bank-accounts', {
        ...base,
        openingBalance: '10.123',
        glAccountId: await gl('112005'),
      })
      .expect(400);
  });

  it('alcance por cuenta: un usuario restringido solo ve sus cuentas (las demás → 404)', async () => {
    const { org, c, gl, bankId } = await setup();
    const glId = await gl('111005');
    const a = await c
      .post('/api/bank-accounts', {
        bankId,
        name: 'Cuenta A',
        accountNumber: '5550001',
        type: 'CORRIENTE',
        currency: 'COP',
        glAccountId: glId,
        openingBalance: '0',
        openingBalanceDate: '2026-09-30',
      })
      .expect(201);
    const b = await c
      .post('/api/bank-accounts', {
        bankId,
        name: 'Cuenta B',
        accountNumber: '5550002',
        type: 'CORRIENTE',
        currency: 'COP',
        glAccountId: glId,
        openingBalance: '0',
        openingBalanceDate: '2026-09-30',
      })
      .expect(201);

    const accountant = await createUser(prisma, org.id, 'ACCOUNTANT');
    const member = await prisma.organizationMember.findFirstOrThrow({
      where: { userId: accountant.id },
    });
    await c.agent
      .put(`/api/users/${member.id}/bank-accounts`)
      .set({ 'x-csrf-token': c.csrf, 'x-organization-id': org.id })
      .send({ scope: 'SELECTED', bankAccountIds: [a.body.id] })
      .expect(200);

    const acc = await loggedIn(app, accountant.email, org.id);
    const list = await acc.get('/api/bank-accounts').expect(200);
    expect(list.body.map((x: { id: string }) => x.id)).toEqual([a.body.id]);
    await acc.get(`/api/bank-accounts/${b.body.id}`).expect(404);
    await acc.post('/api/bank-accounts', {}).expect(403); // el Contador no gestiona cuentas
  });

  it('prueba 24: otra organización no ve ni encuentra las cuentas', async () => {
    const { c, gl, bankId } = await setup();
    const acc = await c
      .post('/api/bank-accounts', {
        bankId,
        name: 'Privada',
        accountNumber: '7770001',
        type: 'CORRIENTE',
        currency: 'USD',
        glAccountId: await gl('111010'),
        openingBalance: '0',
        openingBalanceDate: '2026-09-30',
      })
      .expect(201);
    const other = await setup();
    expect((await other.c.get('/api/bank-accounts').expect(200)).body).toEqual([]);
    await other.c.get(`/api/bank-accounts/${acc.body.id}`).expect(404);
  });
});

describe('plan de cuentas (PUC)', () => {
  it('el PUC base solo se carga una vez y exige cuenta padre al crear', async () => {
    const { c } = await setup();
    await c.post('/api/chart-of-accounts/load-base').expect(409);
    const orphan = await c
      .post('/api/chart-of-accounts', { code: '170505', name: 'Huérfana' })
      .expect(400);
    expect(orphan.body.code).toBe('PUC_PARENT_MISSING');
    const ok = await c
      .post('/api/chart-of-accounts', { code: '11100501', name: 'Bancolombia 7890' })
      .expect(201);
    expect(ok.body).toMatchObject({ level: 5, nature: 'DEBITO', acceptsMovement: true });
  });

  it('importa desde Excel con vista previa; con errores no guarda nada', async () => {
    const { org, c } = await setup();
    const bad = xlsx([
      ['Código', 'Nombre', 'Naturaleza'],
      [111015, 'Bancos USD 2', 'D'],
      ['ABC', 'Mal código', ''],
      [170505, 'Sin padre', 'D'],
    ]);
    const preview = await upload(c, bad, 'puc.xlsx', true).expect(200);
    expect(preview.body).toMatchObject({ applied: false, toCreate: 2, errorCount: 2 });
    expect(preview.body.errors.map((e: { message: string }) => e.message).join(' ')).toMatch(
      /Código inválido.*padre 1705/s,
    );
    const before = await prisma.glAccount.count({ where: { organizationId: org.id } });
    await upload(c, bad, 'puc.xlsx').expect(400);
    expect(await prisma.glAccount.count({ where: { organizationId: org.id } })).toBe(before);

    const good = xlsx([
      ['Mi PUC'],
      ['Código', 'Nombre', 'Naturaleza', 'Movimiento'],
      [111015, 'Bancos moneda extranjera 2', 'D', 'S'],
      ['530505', 'Gastos bancarios (renombrada)', 'D', 'S'],
    ]);
    const res = await upload(c, good, 'puc.xlsx').expect(200);
    expect(res.body).toMatchObject({ applied: true, toCreate: 1, toUpdate: 1 });
    expect(
      (
        await prisma.glAccount.findFirstOrThrow({
          where: { organizationId: org.id, code: '530505' },
        })
      ).name,
    ).toBe('Gastos bancarios (renombrada)');
  });

  it('rechaza archivos que no son hojas de cálculo (firma real, no extensión)', async () => {
    const { c } = await setup();
    const res = await upload(c, Buffer.from('%PDF-1.7 contenido'), 'puc.xlsx').expect(400);
    expect(res.body.code).toBe('FILE_TYPE_INVALID');
  });

  it('mapeo de notas bancarias: sugeridos desde el PUC y validación de cuenta', async () => {
    const { c, gl } = await setup();
    const applied = await c.post('/api/fee-mappings/apply-suggested').expect(200);
    expect(applied.body.applied).toBe(8);
    const list = await c.get('/api/fee-mappings').expect(200);
    expect(list.body.find((m: { feeType: string }) => m.feeType === 'GMF').glAccount.code).toBe(
      '511595',
    );
    const bad = await c.agent
      .put('/api/fee-mappings')
      .set({ 'x-csrf-token': c.csrf, 'x-organization-id': c.orgId! })
      .send({ feeType: 'GMF', glAccountId: await gl('5115') })
      .expect(400);
    expect(bad.body.code).toBe('GL_ACCOUNT_NOT_POSTABLE');
    // Cuenta en uso: no se puede desactivar
    const used = await c
      .patch(`/api/chart-of-accounts/${await gl('511595')}`, { status: 'INACTIVE' })
      .expect(409);
    expect(used.body.code).toBe('GL_ACCOUNT_IN_USE');
  });
});

describe('festivos y periodos', () => {
  it('festivos nacionales calculados + adicionales de la organización', async () => {
    const { c } = await setup();
    const res = await c.get('/api/holidays?year=2026').expect(200);
    expect(res.body.filter((h: { source: string }) => h.source === 'NACIONAL')).toHaveLength(18);
    await c.post('/api/holidays', { date: '2026-11-16', name: 'Repetido' }).expect(409);
    const custom = await c
      .post('/api/holidays', { date: '2026-12-24', name: 'Nochebuena (empresa)' })
      .expect(201);
    expect((await c.get('/api/holidays?year=2026').expect(200)).body).toHaveLength(19);
    await c.delete(`/api/holidays/${custom.body.id}`).expect(204);
  });

  it('abre periodos pasados o actuales, nunca futuros ni duplicados', async () => {
    const { c } = await setup();
    await c.post('/api/periods', { year: 2026, month: 10 }).expect(201);
    await c.post('/api/periods', { year: 2026, month: 10 }).expect(409);
    const future = await c.post('/api/periods', { year: 2099, month: 1 }).expect(400);
    expect(future.body.code).toBe('PERIOD_IN_FUTURE');
    const list = await c.get('/api/periods?year=2026').expect(200);
    expect(list.body.periods.map((p: { month: number }) => p.month)).toEqual([10]);
  });

  it('un Revisor puede consultar pero no modificar datos maestros', async () => {
    const { org } = await setup();
    const reviewer = await createUser(prisma, org.id, 'REVIEWER');
    const r = await loggedIn(app, reviewer.email, org.id);
    await r.get('/api/chart-of-accounts').expect(200);
    await r.get('/api/holidays?year=2026').expect(200);
    await r.post('/api/periods', { year: 2026, month: 9 }).expect(403);
    await r.post('/api/chart-of-accounts', { code: '11100599', name: 'X' }).expect(403);
  });
});
