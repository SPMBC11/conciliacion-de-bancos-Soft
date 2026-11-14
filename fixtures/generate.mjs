/**
 * Genera archivos 100 % FICTICIOS para pruebas y demostración (Empresa Demo S.A.S., octubre 2026).
 * Uso: node fixtures/generate.mjs   — Nunca usar datos bancarios reales en este repositorio (es público).
 *
 * Escenario (para la Fase 6, cuadra a diferencia $0):
 *  · Exactas por referencia, 1→N (consignación = 3 recibos), N→1 (nómina: 3 débitos banco = 1 asiento),
 *    diferencia de fecha con festivo (09/10 viernes → 13/10 martes; 12/10 festivo), GMF diarios,
 *    comisión + IVA, rendimientos + retención, cuota de manejo, cheque no cobrado (CH-000124),
 *    consignación en tránsito (RC-0007), consignación no identificada, error de digitación (385.000 vs 358.000)
 *    y un recibo registrado dos veces en libros (RC-0006).
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import XLSX from 'xlsx';

const out = path.dirname(fileURLToPath(import.meta.url));
const cents = (s) => BigInt(Math.round(Number(s) * 100)); // solo para literales del generador
const fmtCO = (c) => {
  const neg = c < 0n;
  const a = neg ? -c : c;
  const int = (a / 100n).toString().replace(/\B(?=(\d{3})+(?!\d))/g, '.');
  return `${neg ? '-' : ''}${int},${String(a % 100n).padStart(2, '0')}`;
};

const OPENING = cents('15250000.75');

// ---------- Extracto Banco Demo A (cuenta corriente COP ****7890) ----------
const bank = [
  ['01/10/2026', 'CONSIGNACION CLIENTE DEMO', 'RC-0001', '1500000'],
  ['01/10/2026', 'GMF 4X1000', '', '-6000'],
  ['02/10/2026', 'TRANSFERENCIA RECIBIDA CLIENTE ALFA', 'REF-7781', '2380000'],
  ['03/10/2026', 'PAGO ACH PROVEEDOR BETA', 'ACH-5521', '-1190000'],
  ['03/10/2026', 'GMF 4X1000', '', '-4760'],
  ['05/10/2026', 'CHEQUE PAGADO 000123', '000123', '-850000'],
  ['06/10/2026', 'COMISION TRANSFERENCIA', 'ND-10', '-8500'],
  ['06/10/2026', 'IVA COMISION', 'ND-10', '-1615'],
  ['09/10/2026', 'PAGO NOMINA EMPLEADO 001', 'NOM-OCT', '-1400000'],
  ['09/10/2026', 'PAGO NOMINA EMPLEADO 002', 'NOM-OCT', '-1400000'],
  ['09/10/2026', 'PAGO NOMINA EMPLEADO 003', 'NOM-OCT', '-1400000'],
  ['09/10/2026', 'GMF 4X1000', '', '-16800'],
  ['13/10/2026', 'CONSIGNACION CLIENTE GAMMA', '', '950000'],
  ['15/10/2026', 'CONSIGNACION CLIENTE ZETA', '', '320000'],
  ['20/10/2026', 'CONSIGNACION SIN IDENTIFICAR', '', '275000'],
  ['20/10/2026', 'GMF 4X1000', '', '-3600'],
  ['22/10/2026', 'PAGO ACH SERVICIOS PUBLICOS', 'ACH-6001', '-385000'],
  ['31/10/2026', 'RENDIMIENTOS FINANCIEROS', '', '12345.67'],
  ['31/10/2026', 'RETEFUENTE RENDIMIENTOS', '', '-864.20'],
  ['31/10/2026', 'CUOTA DE MANEJO', '', '-25000'],
];
let bal = OPENING;
const bankRows = bank.map(([d, desc, ref, v]) => {
  const a = cents(v);
  bal += a;
  return [d, desc, ref, a < 0n ? fmtCO(-a) : '', a > 0n ? fmtCO(a) : '', fmtCO(bal)];
});
const BANK_CLOSING = bal;
const csv = [
  'BANCO DEMO A S.A. - EXTRACTO CUENTA CORRIENTE ****7890 - DATOS FICTICIOS',
  'Fecha;Descripción;Referencia;Débito;Crédito;Saldo',
  ...bankRows.map((r) => r.join(';')),
  `TOTAL MOVIMIENTOS;;;;;`,
].join('\r\n');
// Windows-1252 (como muchos portales bancarios colombianos)
fs.writeFileSync(
  path.join(out, 'banco-demo-a-2026-10.csv'),
  Buffer.from([...csv].map((c) => c.charCodeAt(0))),
);

// Mismo extracto en OFX 1.x (SGML)
const ofx = [
  'OFXHEADER:100',
  'DATA:OFXSGML',
  'VERSION:102',
  'ENCODING:USASCII',
  '',
  '<OFX><BANKMSGSRSV1><STMTTRNRS><STMTRS><CURDEF>COP',
  '<BANKACCTFROM><BANKID>DEMO<ACCTID>0000007890<ACCTTYPE>CHECKING</BANKACCTFROM>',
  '<BANKTRANLIST><DTSTART>20261001<DTEND>20261031',
  ...bank.map(([d, desc, ref, v], i) => {
    const [dd, mm, yyyy] = d.split('/');
    return `<STMTTRN><TRNTYPE>${Number(v) < 0 ? 'DEBIT' : 'CREDIT'}<DTPOSTED>${yyyy}${mm}${dd}<TRNAMT>${Number(v).toFixed(2)}<FITID>DEMOA-202610-${i + 1}<NAME>${desc}${ref ? `<REFNUM>${ref}` : ''}`;
  }),
  `</BANKTRANLIST><LEDGERBAL><BALAMT>${(Number(BANK_CLOSING) / 100).toFixed(2)}<DTASOF>20261031</LEDGERBAL>`,
  '</STMTRS></STMTTRNRS></BANKMSGSRSV1></OFX>',
].join('\n');
fs.writeFileSync(path.join(out, 'banco-demo-a-2026-10.ofx'), ofx);

// ---------- Auxiliar contable 111005 (software ficticio "ERP Demo") ----------
const book = [
  [
    '2026-10-01',
    'RC-0001',
    'Cliente Demo S.A.S.',
    '900000101',
    'Recibo de caja factura FV-101',
    '500000',
    '',
  ],
  [
    '2026-10-01',
    'RC-0002',
    'Cliente Demo S.A.S.',
    '900000101',
    'Recibo de caja factura FV-102',
    '500000',
    '',
  ],
  [
    '2026-10-01',
    'RC-0003',
    'Cliente Demo S.A.S.',
    '900000101',
    'Recibo de caja factura FV-103',
    '500000',
    '',
  ],
  [
    '2026-10-02',
    'RC-0004',
    'Cliente Alfa Ltda.',
    '900000202',
    'Transferencia REF-7781',
    '2380000',
    '',
  ],
  [
    '2026-10-02',
    'CE-0042',
    'Proveedor Beta S.A.S.',
    '800000303',
    'Pago ACH-5521 factura 88',
    '',
    '1190000',
  ],
  ['2026-10-03', 'CH-000123', 'Proveedor Delta S.A.S.', '800000404', 'Cheque 000123', '', '850000'],
  [
    '2026-10-07',
    'CH-000124',
    'Proveedor Épsilon S.A.S.',
    '800000505',
    'Cheque 000124',
    '',
    '620000',
  ],
  [
    '2026-10-09',
    'RC-0005',
    'Cliente Gamma S.A.S.',
    '900000606',
    'Consignación cliente Gamma',
    '950000',
    '',
  ],
  ['2026-10-09', 'NO-0010', 'Empleados', '', 'Nómina octubre 2026', '', '4200000'],
  [
    '2026-10-14',
    'RC-0006',
    'Cliente Zeta S.A.S.',
    '900000707',
    'Recibo de caja factura FV-130',
    '320000',
    '',
  ],
  [
    '2026-10-14',
    'RC-0006',
    'Cliente Zeta S.A.S.',
    '900000707',
    'Recibo de caja factura FV-130',
    '320000',
    '',
  ],
  [
    '2026-10-22',
    'CE-0050',
    'Empresa de Servicios Públicos',
    '890000808',
    'Pago ACH-6001 servicios',
    '',
    '358000',
  ],
  [
    '2026-10-30',
    'RC-0007',
    'Cliente Eta S.A.S.',
    '900000909',
    'Consignación cliente Eta',
    '1100000',
    '',
  ],
];
const toSerial = (iso) =>
  (Date.UTC(...iso.split('-').map((n, i) => (i === 1 ? Number(n) - 1 : Number(n)))) -
    Date.UTC(1899, 11, 30)) /
  86400000;
let bookBal = OPENING;
book.forEach(([, , , , , dr, cr]) => (bookBal += (dr ? cents(dr) : 0n) - (cr ? cents(cr) : 0n)));
const aoa = [
  ['EMPRESA DEMO S.A.S. - NIT 900.000.001-1 (FICTICIO)'],
  ['Auxiliar por cuenta 111005 Bancos - Banco Demo A ****7890 - Octubre 2026'],
  [],
  ['Fecha', 'Comprobante', 'Tercero', 'NIT', 'Detalle', 'Débito', 'Crédito'],
  ...book.map(([d, comp, t, nit, det, dr, cr]) => [
    toSerial(d),
    comp,
    t,
    nit,
    det,
    dr ? Number(dr) : 0,
    cr ? Number(cr) : 0,
  ]),
  [],
  ['', '', '', '', 'Saldo inicial', Number(OPENING) / 100, ''],
  ['', '', '', '', 'Saldo final', Number(bookBal) / 100, ''],
];
const ws = XLSX.utils.aoa_to_sheet(aoa);
ws['!cols'] = [
  { wch: 11 },
  { wch: 12 },
  { wch: 30 },
  { wch: 12 },
  { wch: 34 },
  { wch: 14 },
  { wch: 14 },
];
for (let r = 4; r < 4 + book.length; r++) {
  const cell = ws[XLSX.utils.encode_cell({ r, c: 0 })];
  if (cell) cell.z = 'dd/mm/yyyy';
}
const wb = XLSX.utils.book_new();
XLSX.utils.book_append_sheet(wb, ws, 'Auxiliar');
fs.writeFileSync(
  path.join(out, 'auxiliar-demo-a-2026-10.xlsx'),
  XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' }),
);

console.log(
  `Extracto: saldo inicial ${fmtCO(OPENING)} · saldo final ${fmtCO(BANK_CLOSING)} · ${bank.length} movimientos`,
);
console.log(
  `Auxiliar: saldo inicial ${fmtCO(OPENING)} · saldo final ${fmtCO(bookBal)} · ${book.length} movimientos`,
);
