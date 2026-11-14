import {
  applyTemplate,
  type BalanceCheck,
  checkBalances,
  type FileFormat,
  type NormalizedTx,
  parseCamt053,
  parseOfx,
  type ParsedRow,
  readGrid,
  type Side,
  type TemplateConfig,
} from '@finagent/parsers';

export type ProcessedDocument = {
  rows: ParsedRow[];
  /** Movimientos válidos con su número de fila de origen. */
  txs: (NormalizedTx & { rowNumber: number; externalId: string | null })[];
  balance: BalanceCheck;
  /** Saldos informados por el propio archivo (OFX/CAMT) o calculados de la columna de saldo. */
  currency: string | null;
};

export class ProcessingError extends Error {}

/**
 * Lógica única de lectura: la usa la vista previa (API) y la importación (worker), así lo que el usuario
 * revisa es exactamente lo que se guarda.
 */
export function processDocument(
  buf: Uint8Array,
  format: FileFormat,
  side: Side,
  template: TemplateConfig | null,
  provided: { opening?: string | null; closing?: string | null },
): ProcessedDocument {
  if (format === 'OFX' || format === 'CAMT053') {
    if (side === 'BOOK')
      throw new ProcessingError(
        'OFX y CAMT.053 son formatos de extracto bancario, no de auxiliar contable.',
      );
    let s;
    try {
      s = format === 'OFX' ? parseOfx(buf) : parseCamt053(buf);
    } catch (err) {
      throw new ProcessingError(`No se pudo leer el archivo ${format}: ${(err as Error).message}`);
    }
    const rows: ParsedRow[] = [
      ...s.transactions.map((t) => ({
        rowNumber: t.rowNumber,
        raw: [],
        status: 'OK' as const,
        errors: [],
        tx: t,
      })),
      ...s.errors.map((e) => ({
        rowNumber: e.rowNumber,
        raw: [],
        status: 'ERROR' as const,
        errors: [e.message],
      })),
    ].sort((a, b) => a.rowNumber - b.rowNumber);
    const opening = provided.opening ?? s.opening;
    const closing = provided.closing ?? s.closing;
    return {
      rows,
      txs: s.transactions,
      balance: checkBalances(s.transactions, { opening, closing }),
      currency: s.currency,
    };
  }

  if (format === 'PDF') {
    throw new ProcessingError(
      'Los PDF aún no son compatibles en v1. Solicite al banco el extracto en Excel, CSV u OFX.',
    );
  }
  if (!template)
    throw new ProcessingError('Seleccione o cree una plantilla de importación para este archivo.');
  const { sheets } = readGrid(buf, format);
  const sheet = sheets[template.sheetIndex];
  if (!sheet)
    throw new ProcessingError(
      `El archivo no tiene la hoja ${template.sheetIndex + 1} que indica la plantilla.`,
    );
  const rows = applyTemplate(sheet.rows, template, side);
  const txs = rows
    .filter((r) => r.tx)
    .map((r) => ({ ...r.tx!, rowNumber: r.rowNumber, externalId: null }));
  return { rows, txs, balance: checkBalances(txs, provided), currency: null };
}
