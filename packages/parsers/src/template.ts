import { type Cents, toAmountString } from '@finagent/domain';
import { type DecimalSeparator, parseAmountNumber, parseAmountText } from './amounts.js';
import { type DateFormat, parseDateText, parseExcelSerial } from './dates.js';
import type { Cell } from './grid.js';
import { normalizeDescription } from './text.js';

/** Lado de la conciliación: BANK = extracto; BOOK = auxiliar contable de la cuenta banco (activo). */
export type Side = 'BANK' | 'BOOK';

export type ColumnMap = {
  date: number;
  valueDate?: number;
  description: number;
  reference?: number;
  documentNumber?: number;
  thirdParty?: number;
  thirdPartyNit?: number;
  debit?: number;
  credit?: number;
  amount?: number;
  balance?: number;
};

/** Plantilla de importación (versión): cómo leer un archivo de un banco o de un software contable. */
export type TemplateConfig = {
  sheetIndex: number;
  /** Fila del encabezado (1 = primera). Se usa para reconocer el archivo en cargas futuras. */
  headerRow: number | null;
  /** Primera fila con datos (1 = primera). */
  startRow: number;
  columns: ColumnMap;
  amountMode: 'DEBIT_CREDIT' | 'SIGNED';
  /** Solo SIGNED: el valor positivo es entrada o salida de dinero de la cuenta. */
  signedPositiveIs?: 'INFLOW' | 'OUTFLOW';
  dateFormat: DateFormat;
  decimalSeparator: DecimalSeparator;
  /** Filas a omitir (totales, saldos, pies): expresiones regulares contra el texto de la fila. */
  skipRowPatterns: string[];
};

export type NormalizedTx = {
  operationDate: string;
  valueDate: string | null;
  descriptionOriginal: string;
  descriptionNormalized: string;
  reference: string | null;
  documentNumber: string | null;
  thirdParty: string | null;
  thirdPartyNit: string | null;
  /** Con signo: + entra a la cuenta, − sale. */
  amount: string;
  balance: string | null;
};

export type ParsedRow = {
  rowNumber: number;
  raw: Cell[];
  status: 'OK' | 'ERROR' | 'SKIPPED';
  errors: string[];
  tx?: NormalizedTx;
};

const text = (c: Cell | undefined) => (c === null || c === undefined ? '' : String(c).trim());
const opt = (row: Cell[], i: number | undefined) => (i === undefined ? null : text(row[i]) || null);

function amountOf(c: Cell | undefined, decimal: DecimalSeparator): Cents | null | undefined {
  if (c === null || c === undefined || c === '') return undefined; // vacío
  return typeof c === 'number' ? parseAmountNumber(c) : parseAmountText(c, decimal);
}

function dateOf(c: Cell | undefined, format: DateFormat): string | null {
  if (c === null || c === undefined) return null;
  return typeof c === 'number' && !/^\d{8}$/.test(String(c))
    ? parseExcelSerial(c)
    : parseDateText(String(c), format);
}

/**
 * Aplica la plantilla a la grilla. Nunca “arregla” datos: una fila que no se puede leer queda en ERROR con su motivo.
 * Débito/crédito se interpretan según el lado: en el extracto el débito es salida; en el auxiliar (cuenta de activo) el débito es entrada.
 */
export function applyTemplate(rows: Cell[][], t: TemplateConfig, side: Side): ParsedRow[] {
  const skip = t.skipRowPatterns.map((p) => new RegExp(p, 'i'));
  const out: ParsedRow[] = [];

  rows.forEach((raw, idx) => {
    const rowNumber = idx + 1;
    if (rowNumber < t.startRow) return;
    const joined = raw.map(text).join(' ').trim();
    if (!joined) return;
    if (skip.some((re) => re.test(joined)))
      return void out.push({ rowNumber, raw, status: 'SKIPPED', errors: [] });

    const errors: string[] = [];
    const operationDate = dateOf(raw[t.columns.date], t.dateFormat);
    if (!operationDate)
      errors.push(`Fecha inválida: "${text(raw[t.columns.date])}" (formato ${t.dateFormat}).`);
    const valueDate =
      t.columns.valueDate === undefined ? null : dateOf(raw[t.columns.valueDate], t.dateFormat);
    const description = text(raw[t.columns.description]);
    if (!description) errors.push('Sin descripción.');

    let amount: Cents | null = null;
    if (t.amountMode === 'DEBIT_CREDIT') {
      const debit = amountOf(raw[t.columns.debit!], t.decimalSeparator);
      const credit = amountOf(raw[t.columns.credit!], t.decimalSeparator);
      if (debit === null || credit === null) errors.push('Importe ilegible en débito o crédito.');
      else if (debit === undefined && credit === undefined)
        errors.push('Sin importe (débito y crédito vacíos).');
      else {
        const d = debit ?? 0n;
        const c = credit ?? 0n;
        if (d < 0n || c < 0n) errors.push('Débito y crédito deben ser positivos.');
        else if (d !== 0n && c !== 0n) errors.push('La fila tiene débito y crédito a la vez.');
        else amount = side === 'BANK' ? c - d : d - c;
      }
    } else {
      const v = amountOf(raw[t.columns.amount!], t.decimalSeparator);
      if (v === null || v === undefined)
        errors.push(`Importe ilegible: "${text(raw[t.columns.amount!])}".`);
      else amount = t.signedPositiveIs === 'OUTFLOW' ? -v : v;
    }
    if (amount === 0n) errors.push('Importe en cero.');

    let balance: string | null = null;
    if (t.columns.balance !== undefined) {
      const b = amountOf(raw[t.columns.balance], t.decimalSeparator);
      if (b === null) errors.push(`Saldo ilegible: "${text(raw[t.columns.balance])}".`);
      else if (b !== undefined) balance = toAmountString(b);
    }

    if (errors.length || !operationDate || amount === null)
      return void out.push({ rowNumber, raw, status: 'ERROR', errors });
    out.push({
      rowNumber,
      raw,
      status: 'OK',
      errors: [],
      tx: {
        operationDate,
        valueDate,
        descriptionOriginal: description,
        descriptionNormalized: normalizeDescription(description),
        reference: opt(raw, t.columns.reference),
        documentNumber: opt(raw, t.columns.documentNumber),
        thirdParty: opt(raw, t.columns.thirdParty),
        thirdPartyNit: opt(raw, t.columns.thirdPartyNit),
        amount: toAmountString(amount),
        balance,
      },
    });
  });
  return out;
}
