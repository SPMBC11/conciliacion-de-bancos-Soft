import type { LedgerSide, TemplateConfigInput } from '@finagent/contracts';

type Cell = string | number | null;
export type FieldKey = keyof TemplateConfigInput['columns'];

const norm = (c: Cell) =>
  String(c ?? '')
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .toLowerCase()
    .trim();

/** Nombres habituales de columnas en extractos y auxiliares colombianos. */
const HINTS: [FieldKey, RegExp][] = [
  ['valueDate', /^fecha (valor|efectiva|aplicacion)/],
  ['date', /^(fecha|fec\.?|date)/],
  ['balance', /^saldo/],
  ['debit', /^(debito|debitos|cargo|cargos|retiro|retiros|salida|valor debito|egreso)/],
  [
    'credit',
    /^(credito|creditos|abono|abonos|deposito|depositos|consignacion|entrada|valor credito|ingreso)/,
  ],
  ['amount', /^(valor|importe|monto)$/],
  ['thirdPartyNit', /^(nit|identificacion|cedula|documento tercero)/],
  ['thirdParty', /^(tercero|nombre|beneficiario)/],
  ['documentNumber', /^(comprobante|documento|numero|no\.?|cheque|num)/],
  ['reference', /^(referencia|ref\.?)/],
  ['description', /^(descripcion|concepto|detalle|transaccion|movimiento|glosa|observacion)/],
];

/** Primera fila (de las 15 primeras) que parezca encabezado: contiene “fecha” y al menos 3 textos. */
export function guessHeaderRow(rows: Cell[][]): number | null {
  const idx = rows
    .slice(0, 15)
    .findIndex(
      (r) =>
        r.some((c) => /^fecha/.test(norm(c))) && r.filter((c) => typeof c === 'string').length >= 3,
    );
  return idx < 0 ? null : idx + 1;
}

export function guessColumns(header: Cell[]): Partial<Record<FieldKey, number>> {
  const out: Partial<Record<FieldKey, number>> = {};
  header.forEach((c, i) => {
    const h = norm(c);
    const hit = HINTS.find(([key, re]) => re.test(h) && out[key] === undefined);
    if (hit) out[hit[0]] = i;
  });
  return out;
}

export function guessDateFormat(sample: Cell): TemplateConfigInput['dateFormat'] {
  const s = String(sample ?? '').trim();
  if (/^\d{4}-\d{1,2}-\d{1,2}/.test(s)) return 'YYYY-MM-DD';
  if (/^\d{4}\/\d{1,2}\/\d{1,2}/.test(s)) return 'YYYY/MM/DD';
  if (/^\d{8}$/.test(s)) return 'YYYYMMDD';
  if (/^\d{1,2}-\d{1,2}-\d{4}/.test(s)) return 'DD-MM-YYYY';
  if (/^\d{1,2}\/\d{1,2}\/\d{2}$/.test(s)) return 'DD/MM/YY';
  return 'DD/MM/YYYY';
}

/** “1.234,56” o “1234,5” ⇒ coma decimal; “1,234.56” ⇒ punto. Por defecto coma (Colombia). */
export function guessDecimal(samples: Cell[]): ',' | '.' {
  for (const c of samples) {
    if (typeof c !== 'string') continue;
    if (/,\d{1,2}$/.test(c)) return ',';
    if (/\.\d{1,2}$/.test(c) && !/,\d{1,2}$/.test(c)) return '.';
  }
  return ',';
}

export function initialConfig(rows: Cell[][]): TemplateConfigInput {
  const headerRow = guessHeaderRow(rows);
  const header = headerRow ? rows[headerRow - 1]! : [];
  const cols = guessColumns(header);
  const first = rows[headerRow ?? 0] ?? [];
  const amountCols = [cols.debit, cols.credit, cols.amount, cols.balance].filter(
    (c): c is number => c !== undefined,
  );
  return {
    sheetIndex: 0,
    headerRow,
    startRow: (headerRow ?? 0) + 1,
    columns: { date: cols.date ?? 0, description: cols.description ?? 1, ...cols },
    amountMode: cols.debit !== undefined && cols.credit !== undefined ? 'DEBIT_CREDIT' : 'SIGNED',
    signedPositiveIs: 'INFLOW',
    dateFormat: guessDateFormat(first[cols.date ?? 0] ?? null),
    decimalSeparator: guessDecimal(
      rows
        .slice(headerRow ?? 0, (headerRow ?? 0) + 20)
        .flatMap((r) => amountCols.map((i) => r[i] ?? null)),
    ),
    skipRowPatterns: ['^TOTAL', 'SALDO ANTERIOR', 'SALDO INICIAL', 'SALDO FINAL'],
  };
}

export const FIELD_LABELS: Record<FieldKey, string> = {
  date: 'Fecha *',
  valueDate: 'Fecha valor',
  description: 'Descripción *',
  reference: 'Referencia',
  documentNumber: 'N.º documento / cheque',
  thirdParty: 'Tercero',
  thirdPartyNit: 'NIT del tercero',
  debit: 'Débito',
  credit: 'Crédito',
  amount: 'Valor con signo',
  balance: 'Saldo',
};

export const fieldsFor = (
  side: LedgerSide,
  mode: TemplateConfigInput['amountMode'],
): FieldKey[] => [
  'date',
  'description',
  ...(mode === 'DEBIT_CREDIT' ? (['debit', 'credit'] as const) : (['amount'] as const)),
  'balance',
  'reference',
  'documentNumber',
  ...(side === 'BOOK' ? (['thirdParty', 'thirdPartyNit'] as const) : []),
  'valueDate',
];

export const colName = (i: number) =>
  i < 26
    ? String.fromCharCode(65 + i)
    : `${String.fromCharCode(64 + Math.floor(i / 26))}${String.fromCharCode(65 + (i % 26))}`;
