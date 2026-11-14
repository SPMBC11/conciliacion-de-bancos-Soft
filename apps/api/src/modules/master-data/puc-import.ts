import { defaultNature, pucLevel, pucParent, type PucNature } from '@finagent/domain';
import XLSX from 'xlsx';

export type PucRow = {
  code: string;
  name: string;
  nature: PucNature;
  level: number;
  acceptsMovement: boolean;
};
export type PucParseResult = { rows: PucRow[]; errors: { row: number; message: string }[] };

const HEADERS = {
  code: /^(c[oó]digo|cod\.?|cuenta)$/i,
  name: /^(nombre|descripci[oó]n|nombre de la cuenta)$/i,
  nature: /^naturaleza$/i,
  movement: /(movimiento|auxiliar|imputable|transaccional)/i,
};

const truthy = /^(s|si|sí|x|1|true|verdadero)$/i;
const falsy = /^(n|no|0|false|falso)$/i;

/** Celda → texto. Los códigos numéricos de Excel (111005) se aceptan solo si son enteros. */
function text(v: unknown): string {
  if (v === undefined || v === null) return '';
  if (typeof v === 'number') return Number.isInteger(v) ? String(v) : String(v);
  return String(v).trim();
}

/**
 * Lee un PUC desde XLSX/XLS/CSV. Solo datos: no se evalúan fórmulas ni macros (contenido = dato, nunca instrucción).
 * Acepta columnas: Código, Nombre, Naturaleza (opcional), Movimiento (opcional), en cualquier orden.
 */
export function parsePucFile(buffer: Buffer): PucParseResult {
  const wb = XLSX.read(buffer, {
    type: 'buffer',
    cellFormula: false,
    cellHTML: false,
    cellNF: false,
    sheetRows: 20_001,
  });
  const sheet = wb.Sheets[wb.SheetNames[0]!];
  if (!sheet) return { rows: [], errors: [{ row: 0, message: 'El archivo no tiene hojas.' }] };
  const grid = XLSX.utils.sheet_to_json<unknown[]>(sheet, {
    header: 1,
    raw: true,
    blankrows: false,
  });

  const headerIdx = grid.findIndex((r) => r.some((c) => HEADERS.code.test(text(c))));
  if (headerIdx < 0)
    return { rows: [], errors: [{ row: 0, message: 'No se encontró la columna “Código”.' }] };
  const header = grid[headerIdx]!.map(text);
  const col = (re: RegExp) => header.findIndex((h) => re.test(h));
  const cCode = col(HEADERS.code);
  const cName = col(HEADERS.name);
  const cNature = col(HEADERS.nature);
  const cMove = col(HEADERS.movement);
  if (cName < 0)
    return {
      rows: [],
      errors: [{ row: headerIdx + 1, message: 'No se encontró la columna “Nombre”.' }],
    };

  const rows: PucRow[] = [];
  const errors: PucParseResult['errors'] = [];
  const seen = new Set<string>();

  grid.slice(headerIdx + 1).forEach((r, i) => {
    const rowNum = headerIdx + i + 2; // número de fila como lo ve el usuario en Excel
    const code = text(r[cCode]);
    const name = text(r[cName]);
    if (!code && !name) return;
    if (!/^\d{1,12}$/.test(code))
      return void errors.push({ row: rowNum, message: `Código inválido: "${code}".` });
    if (!name)
      return void errors.push({ row: rowNum, message: `La cuenta ${code} no tiene nombre.` });
    if (seen.has(code))
      return void errors.push({ row: rowNum, message: `Código repetido en el archivo: ${code}.` });

    let level: number;
    try {
      level = pucLevel(code);
    } catch (err) {
      return void errors.push({ row: rowNum, message: (err as Error).message });
    }

    const natureRaw = cNature >= 0 ? text(r[cNature]).toUpperCase() : '';
    const nature: PucNature | null = !natureRaw
      ? defaultNature(code)
      : /^(D|DB|DEBITO|DÉBITO)$/.test(natureRaw)
        ? 'DEBITO'
        : /^(C|CR|CREDITO|CRÉDITO)$/.test(natureRaw)
          ? 'CREDITO'
          : null;
    if (!nature)
      return void errors.push({
        row: rowNum,
        message: `Naturaleza no reconocida: "${natureRaw}" (use D o C).`,
      });

    const moveRaw = cMove >= 0 ? text(r[cMove]) : '';
    const acceptsMovement = truthy.test(moveRaw) ? true : falsy.test(moveRaw) ? false : level >= 4;

    seen.add(code);
    rows.push({ code, name, nature, level, acceptsMovement });
  });

  return {
    rows: rows.sort((a, b) => a.code.length - b.code.length || a.code.localeCompare(b.code)),
    errors,
  };
}

/** Verifica que cada cuenta tenga su padre (en el archivo o ya existente). */
export function missingParents(rows: PucRow[], existingCodes: Set<string>) {
  const all = new Set([...existingCodes, ...rows.map((r) => r.code)]);
  return rows
    .map((r) => ({ code: r.code, parent: pucParent(r.code) }))
    .filter((r): r is { code: string; parent: string } => r.parent !== null && !all.has(r.parent));
}
