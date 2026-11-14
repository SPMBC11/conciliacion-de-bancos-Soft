import { type Cents, toAmountString } from '@finagent/domain';
import { XMLParser } from 'fast-xml-parser';
import { parseAmountText } from './amounts.js';
import { parseDateText } from './dates.js';
import type { NormalizedTx } from './template.js';
import { decodeText, normalizeDescription } from './text.js';

/** Extracto estándar (OFX / CAMT.053): no requiere plantilla porque el formato define los campos. */
export type StructuredStatement = {
  accountId: string | null;
  currency: string | null;
  opening: string | null;
  closing: string | null;
  transactions: (NormalizedTx & { rowNumber: number; externalId: string | null })[];
  errors: { rowNumber: number; message: string }[];
};

const tx = (
  rowNumber: number,
  p: {
    date: string;
    valueDate?: string | null;
    amount: Cents;
    description: string;
    reference?: string | null;
    doc?: string | null;
    externalId?: string | null;
    thirdParty?: string | null;
  },
) => ({
  rowNumber,
  externalId: p.externalId ?? null,
  operationDate: p.date,
  valueDate: p.valueDate ?? null,
  descriptionOriginal: p.description,
  descriptionNormalized: normalizeDescription(p.description),
  reference: p.reference || null,
  documentNumber: p.doc || null,
  thirdParty: p.thirdParty || null,
  thirdPartyNit: null,
  amount: toAmountString(p.amount),
  balance: null,
});

/** Valor de una etiqueta OFX: sirve para SGML (OFX 1.x, sin cierre) y XML (OFX 2.x). */
const ofxTag = (block: string, tag: string) =>
  new RegExp(`<${tag}>([^<\\r\\n]*)`, 'i').exec(block)?.[1]?.trim() ?? null;

/** OFX 1.x (SGML) y 2.x (XML). Importes con punto decimal; positivo = crédito (entra). */
export function parseOfx(buf: Uint8Array): StructuredStatement {
  const text = decodeText(buf).text;
  const errors: StructuredStatement['errors'] = [];
  const blocks = text
    .split(/<STMTTRN>/i)
    .slice(1)
    .map((b) => b.split(/<\/STMTTRN>/i)[0]!);
  const transactions = blocks.flatMap((b, i) => {
    const rowNumber = i + 1;
    const date = parseDateText((ofxTag(b, 'DTPOSTED') ?? '').slice(0, 8), 'YYYYMMDD');
    const amount = parseAmountText(ofxTag(b, 'TRNAMT') ?? '', '.');
    if (!date || amount === null) {
      errors.push({
        rowNumber,
        message: `Movimiento OFX ${rowNumber} sin fecha o importe válido.`,
      });
      return [];
    }
    const name = ofxTag(b, 'NAME') ?? '';
    const memo = ofxTag(b, 'MEMO') ?? '';
    return [
      tx(rowNumber, {
        date,
        amount,
        description:
          [name, memo].filter(Boolean).join(' - ') || (ofxTag(b, 'TRNTYPE') ?? 'MOVIMIENTO'),
        reference: ofxTag(b, 'REFNUM'),
        doc: ofxTag(b, 'CHECKNUM'),
        externalId: ofxTag(b, 'FITID'),
      }),
    ];
  });
  const ledger = /<LEDGERBAL>([\s\S]*?)(<\/LEDGERBAL>|<AVAILBAL>|$)/i.exec(text)?.[1] ?? '';
  const closing = parseAmountText(ofxTag(ledger, 'BALAMT') ?? '', '.');
  return {
    accountId: ofxTag(text, 'ACCTID'),
    currency: ofxTag(text, 'CURDEF'),
    opening: null,
    closing: closing === null ? null : toAmountString(closing),
    transactions,
    errors,
  };
}

const arr = <T>(v: T | T[] | undefined): T[] => (v === undefined ? [] : Array.isArray(v) ? v : [v]);
type Node = Record<string, unknown>;
const get = (o: unknown, ...path: string[]): unknown =>
  path.reduce<unknown>((acc, k) => (acc as Node | undefined)?.[k], o);
const str = (v: unknown) =>
  v === undefined || v === null
    ? null
    : typeof v === 'object'
      ? String((v as Node)['#text'] ?? '')
      : String(v);

/** ISO 20022 CAMT.053 (extracto). Saldos OPBD (apertura) y CLBD (cierre); CRDT entra, DBIT sale. */
export function parseCamt053(buf: Uint8Array): StructuredStatement {
  const text = decodeText(buf).text;
  // Sin DTD: evita entidades externas (XXE) y expansión de entidades.
  if (/<!DOCTYPE|<!ENTITY/i.test(text))
    throw new Error('El XML contiene DTD/entidades: no se procesa por seguridad.');
  const xml = new XMLParser({
    ignoreAttributes: false,
    removeNSPrefix: true,
    processEntities: false,
    parseTagValue: false,
  }).parse(text);
  const stmt = arr(get(xml, 'Document', 'BkToCstmrStmt', 'Stmt') as Node | Node[])[0];
  if (!stmt) throw new Error('No se encontró el extracto (BkToCstmrStmt/Stmt).');

  const balanceOf = (code: string) => {
    const bal = arr(stmt.Bal as Node | Node[]).find(
      (b) => str(get(b, 'Tp', 'CdOrPrtry', 'Cd')) === code,
    );
    if (!bal) return null;
    const amt = parseAmountText(str(get(bal, 'Amt')) ?? '', '.');
    if (amt === null) return null;
    return toAmountString(str(get(bal, 'CdtDbtInd')) === 'DBIT' ? -amt : amt);
  };

  const errors: StructuredStatement['errors'] = [];
  const transactions = arr(stmt.Ntry as Node | Node[]).flatMap((e, i) => {
    const rowNumber = i + 1;
    const amt = parseAmountText(str(get(e, 'Amt')) ?? '', '.');
    const date = (str(get(e, 'BookgDt', 'Dt')) ?? str(get(e, 'BookgDt', 'DtTm')) ?? '').slice(
      0,
      10,
    );
    const iso = parseDateText(date, 'YYYY-MM-DD');
    if (amt === null || !iso) {
      errors.push({
        rowNumber,
        message: `Movimiento CAMT ${rowNumber} sin fecha o importe válido.`,
      });
      return [];
    }
    const details = arr(get(e, 'NtryDtls', 'TxDtls') as Node | Node[])[0];
    const description =
      [str(get(details, 'RmtInf', 'Ustrd')), str(get(e, 'AddtlNtryInf'))]
        .filter(Boolean)
        .join(' - ') || 'MOVIMIENTO';
    return [
      tx(rowNumber, {
        date: iso,
        valueDate: parseDateText((str(get(e, 'ValDt', 'Dt')) ?? '').slice(0, 10), 'YYYY-MM-DD'),
        amount: str(get(e, 'CdtDbtInd')) === 'DBIT' ? -amt : amt,
        description,
        reference: str(get(details, 'Refs', 'EndToEndId')) ?? str(get(e, 'AcctSvcrRef')),
        externalId: str(get(e, 'NtryRef')) ?? str(get(e, 'AcctSvcrRef')),
        thirdParty:
          str(get(details, 'RltdPties', 'Dbtr', 'Nm')) ??
          str(get(details, 'RltdPties', 'Cdtr', 'Nm')),
      }),
    ];
  });

  return {
    accountId: str(get(stmt, 'Acct', 'Id', 'IBAN')) ?? str(get(stmt, 'Acct', 'Id', 'Othr', 'Id')),
    currency: str(get(stmt, 'Acct', 'Ccy')),
    opening: balanceOf('OPBD'),
    closing: balanceOf('CLBD'),
    transactions,
    errors,
  };
}
