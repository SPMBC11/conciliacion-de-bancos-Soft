import XLSX from 'xlsx';
import { describe, expect, it } from 'vitest';
import { parseAmountNumber, parseAmountText } from './amounts.js';
import { parseDateText, parseExcelSerial } from './dates.js';
import { detectFormat } from './detect.js';
import { contentFingerprint } from './fingerprint.js';
import { readGrid } from './grid.js';
import { checkBalances } from './statement.js';
import { parseCamt053, parseOfx } from './structured.js';
import { applyTemplate, type TemplateConfig } from './template.js';
import { decodeText, headerSignature, normalizeDescription } from './text.js';

const enc = (s: string) => new TextEncoder().encode(s);
/** Windows-1252 de un texto latino (para simular un CSV “ANSI” de banco). */
const ansi = (s: string) => Uint8Array.from([...s].map((ch) => ch.charCodeAt(0)));

describe('importes', () => {
  it('texto con separador decimal explícito', () => {
    expect(parseAmountText('1.234.567,89', ',')).toBe(123456789n);
    expect(parseAmountText('1,234,567.89', '.')).toBe(123456789n);
    expect(parseAmountText('$ 4.000', ',')).toBe(400000n);
    expect(parseAmountText('(1.500,00)', ',')).toBe(-150000n);
    expect(parseAmountText('1.500,00-', ',')).toBe(-150000n);
    expect(parseAmountText('-12', ',')).toBe(-1200n);
    expect(parseAmountText('COP 100', ',')).toBe(10000n);
  });

  it('rechaza formatos ambiguos o con más de 2 decimales', () => {
    for (const bad of ['1,234.56', '12.34', '1.2345', 'abc', '1,234', '1,2,3'])
      expect(parseAmountText(bad, ','), bad).toBeNull();
    expect(parseAmountText('1.234,567', '.')).toBeNull();
  });

  it('número de Excel: exacto hasta 2 decimales', () => {
    expect(parseAmountNumber(1234567.89)).toBe(123456789n);
    expect(parseAmountNumber(0.1 + 0.2)).toBe(30n);
    expect(parseAmountNumber(10.005)).toBeNull();
  });
});

describe('fechas', () => {
  it('formatos de plantilla', () => {
    expect(parseDateText('31/10/2026', 'DD/MM/YYYY')).toBe('2026-10-31');
    expect(parseDateText('1/9/2026 14:22', 'DD/MM/YYYY')).toBe('2026-09-01');
    expect(parseDateText('31/10/26', 'DD/MM/YY')).toBe('2026-10-31');
    expect(parseDateText('20261031', 'YYYYMMDD')).toBe('2026-10-31');
    expect(parseDateText('10/31/2026', 'MM/DD/YYYY')).toBe('2026-10-31');
    expect(parseDateText('31/02/2026', 'DD/MM/YYYY')).toBeNull();
    expect(parseDateText('2026-10-31', 'DD/MM/YYYY')).toBeNull();
  });
  it('serial de Excel sin zona horaria', () => {
    expect(parseExcelSerial(46326)).toBe('2026-10-31');
    expect(parseExcelSerial(-1)).toBeNull();
  });
});

describe('texto', () => {
  it('UTF-8 o Windows-1252', () => {
    expect(decodeText(enc('Consignación')).encoding).toBe('utf-8');
    const latin = decodeText(ansi('Consignación'));
    expect(latin).toEqual({ text: 'Consignación', encoding: 'windows-1252' });
  });
  it('normaliza descripciones y encabezados', () => {
    expect(normalizeDescription('  Comisión   transferencia  ')).toBe('COMISION TRANSFERENCIA');
    expect(headerSignature(['Fecha', 'Descripción', null, 'Valor ($)'])).toBe(
      'FECHA|DESCRIPCION|VALOR',
    );
  });
});

describe('separador de CSV', () => {
  it('prefiere “;” cuando la coma es decimal', async () => {
    const { guessDelimiter } = await import('./grid.js');
    expect(guessDelimiter('a;b;c\n1;2.500,00;3\n4;5,5;6')).toBe(';');
    expect(guessDelimiter('a,b,c\n1,2,3')).toBe(',');
    expect(guessDelimiter('a\tb\n1\t2')).toBe('\t');
  });
});

describe('trazabilidad de filas', () => {
  it('las filas vacías se conservan: el número de fila coincide con el del archivo original', () => {
    const csv = readGrid(enc('Titulo\n\nFecha;Detalle;Valor\n01/10/2026;A;10,00\n'), 'CSV')
      .sheets[0]!.rows;
    expect(csv[2]).toEqual(['Fecha', 'Detalle', 'Valor']); // fila 3, como en el archivo
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(
      wb,
      XLSX.utils.aoa_to_sheet([['Título'], [], ['Fecha', 'Detalle']]),
      'H',
    );
    const xlsx = readGrid(XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' }), 'XLSX').sheets[0]!
      .rows;
    expect(xlsx[2]).toEqual(['Fecha', 'Detalle']);
  });
});

describe('detección de formato por contenido', () => {
  it('reconoce firmas', () => {
    expect(detectFormat(enc('%PDF-1.7'))).toBe('PDF');
    expect(detectFormat(Uint8Array.from([0x50, 0x4b, 0x03, 0x04, 0]))).toBe('XLSX');
    expect(detectFormat(enc('OFXHEADER:100\nDATA:OFXSGML'))).toBe('OFX');
    expect(
      detectFormat(
        enc(
          '<?xml version="1.0"?><Document xmlns="urn:iso:std:iso:20022:tech:xsd:camt.053.001.02">',
        ),
      ),
    ).toBe('CAMT053');
    expect(detectFormat(enc('Fecha;Descripcion;Valor\n'), 'x.csv')).toBe('CSV');
    expect(detectFormat(Uint8Array.from([1, 2, 0, 4]))).toBeNull();
  });
});

const BANK_CSV = [
  'BANCO DEMO A - EXTRACTO CUENTA CORRIENTE ****7890',
  'Fecha;Descripción;Referencia;Débito;Crédito;Saldo',
  '01/10/2026;Consignación cliente demo;RC-0001;;1.500.000,00;16.750.000,75',
  '02/10/2026;GMF 4x1000;;6.000,00;;16.744.000,75',
  '03/10/2026;Comisión transferencia;ND-10;8.500,00;;16.735.500,75',
  'TOTAL;;;14.500,00;1.500.000,00;',
].join('\r\n');

const BANK_TEMPLATE: TemplateConfig = {
  sheetIndex: 0,
  headerRow: 2,
  startRow: 3,
  columns: { date: 0, description: 1, reference: 2, debit: 3, credit: 4, balance: 5 },
  amountMode: 'DEBIT_CREDIT',
  dateFormat: 'DD/MM/YYYY',
  decimalSeparator: ',',
  skipRowPatterns: ['^TOTAL'],
};

describe('CSV de banco con plantilla', () => {
  it('lee Windows-1252 con punto y coma, omite totales y aplica signo del extracto', () => {
    const { sheets, encoding, delimiter } = readGrid(ansi(BANK_CSV), 'CSV');
    expect({ encoding, delimiter }).toEqual({ encoding: 'windows-1252', delimiter: ';' });
    expect(headerSignature(sheets[0]!.rows[1]!)).toBe(
      'FECHA|DESCRIPCION|REFERENCIA|DEBITO|CREDITO|SALDO',
    );
    const rows = applyTemplate(sheets[0]!.rows, BANK_TEMPLATE, 'BANK');
    expect(rows.map((r) => r.status)).toEqual(['OK', 'OK', 'OK', 'SKIPPED']);
    expect(rows.map((r) => r.tx?.amount)).toEqual([
      '1500000.00',
      '-6000.00',
      '-8500.00',
      undefined,
    ]);
    expect(rows[0]!.tx).toMatchObject({
      operationDate: '2026-10-01',
      descriptionOriginal: 'Consignación cliente demo',
      descriptionNormalized: 'CONSIGNACION CLIENTE DEMO',
      reference: 'RC-0001',
    });
  });

  it('prueba 13: valida la ecuación de saldos y detecta cuando no cuadra', () => {
    const rows = applyTemplate(
      readGrid(ansi(BANK_CSV), 'CSV').sheets[0]!.rows,
      BANK_TEMPLATE,
      'BANK',
    );
    const txs = rows.filter((r) => r.tx).map((r) => ({ ...r.tx!, rowNumber: r.rowNumber }));
    expect(checkBalances(txs)).toMatchObject({
      opening: '15250000.75',
      closing: '16735500.75',
      inflows: '1500000.00',
      outflows: '14500.00',
      balanced: true,
      difference: '0.00',
    });
    expect(checkBalances(txs, { opening: '15250000.75', closing: '16700000.00' })).toMatchObject({
      balanced: false,
      difference: '35500.75',
    });
    const broken = txs.map((t, i) => (i === 2 ? { ...t, balance: '16735000.75' } : t));
    expect(checkBalances(broken).runningBalanceErrors).toEqual([5]);
  });

  it('marca filas ilegibles sin corregirlas', () => {
    const rows = applyTemplate(
      [
        [null],
        ['31/02/2026', 'X', null, 'abc', null, null],
        ['01/10/2026', 'Y', null, '10,00', '5,00', null],
      ],
      { ...BANK_TEMPLATE, startRow: 1 },
      'BANK',
    );
    expect(rows.map((r) => r.status)).toEqual(['ERROR', 'ERROR']);
    expect(rows[0]!.errors.join(' ')).toMatch(/Fecha inválida.*Importe ilegible/);
    expect(rows[1]!.errors).toEqual(['La fila tiene débito y crédito a la vez.']);
  });

  it('extracto en orden descendente: detecta y calcula apertura correctamente', () => {
    const txs = [
      { operationDate: '2026-10-03', amount: '-8500.00', balance: '16735500.75', rowNumber: 3 },
      { operationDate: '2026-10-01', amount: '1500000.00', balance: '16744000.75', rowNumber: 4 },
    ].map((t) => ({
      ...t,
      valueDate: null,
      descriptionOriginal: '',
      descriptionNormalized: '',
      reference: null,
      documentNumber: null,
      thirdParty: null,
      thirdPartyNit: null,
    }));
    expect(checkBalances(txs)).toMatchObject({
      reversed: true,
      opening: '15244000.75',
      closing: '16735500.75',
      balanced: true,
    });
  });
});

describe('XLSX de auxiliar contable', () => {
  it('lee números y fechas seriales; en el auxiliar el débito es entrada', () => {
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(
      wb,
      XLSX.utils.aoa_to_sheet([
        ['Auxiliar 111005 - Bancos'],
        ['Fecha', 'Comprobante', 'Tercero', 'NIT', 'Detalle', 'Débito', 'Crédito'],
        [46296, 'RC-0001', 'Cliente Demo SAS', '900111222', 'Recaudo factura 10', 1500000, 0],
        [46297, 'CE-0042', 'Proveedor Demo', '800333444', 'Pago proveedor', 0, 2350000.5],
      ]),
      'Aux',
    );
    const buf = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' });
    expect(detectFormat(buf)).toBe('XLSX');
    const { sheets } = readGrid(buf, 'XLSX');
    const rows = applyTemplate(
      sheets[0]!.rows,
      {
        ...BANK_TEMPLATE,
        headerRow: 2,
        startRow: 3,
        columns: {
          date: 0,
          documentNumber: 1,
          thirdParty: 2,
          thirdPartyNit: 3,
          description: 4,
          debit: 5,
          credit: 6,
        },
        skipRowPatterns: [],
      },
      'BOOK',
    );
    expect(rows.map((r) => [r.tx?.operationDate, r.tx?.amount, r.tx?.thirdPartyNit])).toEqual([
      ['2026-10-01', '1500000.00', '900111222'],
      ['2026-10-02', '-2350000.50', '800333444'],
    ]);
  });

  it('modo importe con signo y convención configurable', () => {
    const rows = applyTemplate(
      [['01/10/2026', 'Pago', '-100,50']],
      {
        ...BANK_TEMPLATE,
        startRow: 1,
        columns: { date: 0, description: 1, amount: 2 },
        amountMode: 'SIGNED',
        signedPositiveIs: 'OUTFLOW',
        skipRowPatterns: [],
      },
      'BANK',
    );
    expect(rows[0]!.tx!.amount).toBe('100.50');
  });
});

describe('OFX', () => {
  const ofx1 = `OFXHEADER:100
DATA:OFXSGML
<OFX><BANKMSGSRSV1><STMTTRNRS><STMTRS><CURDEF>COP
<BANKACCTFROM><ACCTID>0001234567
<BANKTRANLIST>
<STMTTRN><TRNTYPE>CREDIT<DTPOSTED>20261001<TRNAMT>1500000.00<FITID>A1<NAME>CONSIGNACION<MEMO>RC-0001
<STMTTRN><TRNTYPE>DEBIT<DTPOSTED>20261002120000[-5:COT]<TRNAMT>-6000.00<FITID>A2<NAME>GMF 4X1000
<STMTTRN><TRNTYPE>CHECK<DTPOSTED>20261005<TRNAMT>-250000<FITID>A3<CHECKNUM>000123<NAME>CHEQUE
</BANKTRANLIST><LEDGERBAL><BALAMT>16494000.75<DTASOF>20261031</LEDGERBAL>
</STMTRS></STMTTRNRS></BANKMSGSRSV1></OFX>`;

  it('OFX 1.x (SGML sin etiquetas de cierre)', () => {
    const s = parseOfx(enc(ofx1));
    expect(s).toMatchObject({
      accountId: '0001234567',
      currency: 'COP',
      closing: '16494000.75',
      errors: [],
    });
    expect(
      s.transactions.map((t) => [t.operationDate, t.amount, t.externalId, t.documentNumber]),
    ).toEqual([
      ['2026-10-01', '1500000.00', 'A1', null],
      ['2026-10-02', '-6000.00', 'A2', null],
      ['2026-10-05', '-250000.00', 'A3', '000123'],
    ]);
    expect(s.transactions[0]!.descriptionOriginal).toBe('CONSIGNACION - RC-0001');
  });

  it('OFX 2.x (XML)', () => {
    const s = parseOfx(
      enc(
        '<?xml version="1.0"?><OFX><STMTTRN><DTPOSTED>20261003</DTPOSTED><TRNAMT>-8500.00</TRNAMT><FITID>B1</FITID><NAME>COMISION</NAME></STMTTRN></OFX>',
      ),
    );
    expect(s.transactions[0]).toMatchObject({
      operationDate: '2026-10-03',
      amount: '-8500.00',
      externalId: 'B1',
    });
  });
});

describe('CAMT.053', () => {
  const camt = `<?xml version="1.0" encoding="UTF-8"?>
<Document xmlns="urn:iso:std:iso:20022:tech:xsd:camt.053.001.02"><BkToCstmrStmt><Stmt>
<Acct><Id><Othr><Id>0099887766</Id></Othr></Id><Ccy>USD</Ccy></Acct>
<Bal><Tp><CdOrPrtry><Cd>OPBD</Cd></CdOrPrtry></Tp><Amt Ccy="USD">12500.50</Amt><CdtDbtInd>CRDT</CdtDbtInd></Bal>
<Bal><Tp><CdOrPrtry><Cd>CLBD</Cd></CdOrPrtry></Tp><Amt Ccy="USD">12470.50</Amt><CdtDbtInd>CRDT</CdtDbtInd></Bal>
<Ntry><NtryRef>N1</NtryRef><Amt Ccy="USD">20.00</Amt><CdtDbtInd>CRDT</CdtDbtInd><BookgDt><Dt>2026-10-15</Dt></BookgDt><ValDt><Dt>2026-10-16</Dt></ValDt>
<NtryDtls><TxDtls><Refs><EndToEndId>E2E-1</EndToEndId></Refs><RmtInf><Ustrd>INTERESES</Ustrd></RmtInf></TxDtls></NtryDtls></Ntry>
<Ntry><NtryRef>N2</NtryRef><Amt Ccy="USD">50.00</Amt><CdtDbtInd>DBIT</CdtDbtInd><BookgDt><Dt>2026-10-20</Dt></BookgDt><AddtlNtryInf>COMISION</AddtlNtryInf></Ntry>
</Stmt></BkToCstmrStmt></Document>`;

  it('saldos de apertura/cierre y signo por CRDT/DBIT', () => {
    const s = parseCamt053(enc(camt));
    expect(s).toMatchObject({
      accountId: '0099887766',
      currency: 'USD',
      opening: '12500.50',
      closing: '12470.50',
      errors: [],
    });
    expect(
      s.transactions.map((t) => [
        t.operationDate,
        t.valueDate,
        t.amount,
        t.reference,
        t.descriptionOriginal,
      ]),
    ).toEqual([
      ['2026-10-15', '2026-10-16', '20.00', 'E2E-1', 'INTERESES'],
      ['2026-10-20', null, '-50.00', null, 'COMISION'],
    ]);
    expect(checkBalances(s.transactions, s).balanced).toBe(true);
  });

  it('rechaza XML con DTD (XXE)', () => {
    expect(() =>
      parseCamt053(
        enc(
          '<?xml version="1.0"?><!DOCTYPE x [<!ENTITY e SYSTEM "file:///etc/passwd">]><Document/>',
        ),
      ),
    ).toThrow(/DTD/);
  });
});

describe('huellas', () => {
  it('prueba 5: dos movimientos idénticos producen la misma huella de contenido', () => {
    const a = {
      operationDate: '2026-10-02',
      amount: '-6000.00',
      reference: null,
      descriptionNormalized: 'GMF 4X1000',
    };
    expect(contentFingerprint(a)).toBe(contentFingerprint({ ...a }));
    expect(contentFingerprint(a)).not.toBe(contentFingerprint({ ...a, amount: '-6000.01' }));
  });
});
