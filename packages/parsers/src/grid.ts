import Papa from 'papaparse';
import XLSX from 'xlsx';
import { decodeText } from './text.js';

/** Celda leída: texto, número (Excel) o null. Las fechas de Excel llegan como número serial. */
export type Cell = string | number | null;
export type Sheet = { name: string; rows: Cell[][] };

const MAX_ROWS = 200_000;

/**
 * Separador de CSV. En Colombia la coma suele ser decimal ("1.500.000,00"), así que se elige el candidato con el
 * número de columnas más constante en las primeras líneas y, en empate, se prefiere “;”.
 */
export function guessDelimiter(text: string): string {
  const lines = text
    .split(/\r?\n/)
    .filter((l) => l.trim())
    .slice(0, 30);
  let best = { delimiter: ';', score: -1 };
  for (const d of [';', '\t', '|', ',']) {
    const counts = lines.map((l) => l.split(d).length - 1).filter((c) => c > 0);
    if (!counts.length) continue;
    const freq = new Map<number, number>();
    counts.forEach((c) => freq.set(c, (freq.get(c) ?? 0) + 1));
    const [mode, times] = [...freq.entries()].sort((a, b) => b[1] - a[1] || b[0] - a[0])[0]!;
    const score = times * 1000 + mode;
    if (score > best.score) best = { delimiter: d, score };
  }
  return best.delimiter;
}

/**
 * Lee la hoja como una grilla. Solo datos: no se evalúan fórmulas, macros ni enlaces externos
 * (el contenido del archivo es siempre dato, nunca instrucción).
 */
export function readGrid(
  buf: Uint8Array,
  format: 'XLSX' | 'XLS' | 'CSV',
): { sheets: Sheet[]; encoding?: string; delimiter?: string } {
  if (format === 'CSV') {
    const { text, encoding } = decodeText(buf);
    const parsed = Papa.parse<string[]>(text, {
      skipEmptyLines: false,
      delimiter: guessDelimiter(text),
    });
    const rows = parsed.data
      .slice(0, MAX_ROWS)
      .map((r) => r.map((c) => (c.trim() === '' ? null : c.trim())));
    return { sheets: [{ name: 'CSV', rows }], encoding, delimiter: parsed.meta.delimiter };
  }
  const wb = XLSX.read(buf, {
    type: 'buffer',
    cellFormula: false,
    cellHTML: false,
    cellNF: false,
    cellDates: false,
    sheetRows: MAX_ROWS,
    WTF: false,
  });
  return {
    sheets: wb.SheetNames.map((name) => ({
      name,
      rows: XLSX.utils
        .sheet_to_json<Cell[]>(wb.Sheets[name]!, {
          header: 1,
          raw: true,
          defval: null,
          blankrows: true,
        })
        .map((r) =>
          r.map((c) =>
            typeof c === 'string'
              ? c.trim() === ''
                ? null
                : c.trim()
              : typeof c === 'number'
                ? c
                : c == null
                  ? null
                  : String(c),
          ),
        ),
    })),
  };
}
