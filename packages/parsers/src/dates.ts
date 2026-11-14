import { toUtc } from '@finagent/domain';
import XLSX from 'xlsx';

export const DATE_FORMATS = [
  'DD/MM/YYYY',
  'DD-MM-YYYY',
  'DD/MM/YY',
  'YYYY-MM-DD',
  'YYYY/MM/DD',
  'YYYYMMDD',
  'MM/DD/YYYY',
] as const;
export type DateFormat = (typeof DATE_FORMATS)[number];

const PATTERNS: Record<
  DateFormat,
  { re: RegExp; order: ['d' | 'm' | 'y', 'd' | 'm' | 'y', 'd' | 'm' | 'y'] }
> = {
  'DD/MM/YYYY': { re: /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/, order: ['d', 'm', 'y'] },
  'DD-MM-YYYY': { re: /^(\d{1,2})-(\d{1,2})-(\d{4})$/, order: ['d', 'm', 'y'] },
  'DD/MM/YY': { re: /^(\d{1,2})\/(\d{1,2})\/(\d{2})$/, order: ['d', 'm', 'y'] },
  'YYYY-MM-DD': { re: /^(\d{4})-(\d{1,2})-(\d{1,2})$/, order: ['y', 'm', 'd'] },
  'YYYY/MM/DD': { re: /^(\d{4})\/(\d{1,2})\/(\d{1,2})$/, order: ['y', 'm', 'd'] },
  YYYYMMDD: { re: /^(\d{4})(\d{2})(\d{2})$/, order: ['y', 'm', 'd'] },
  'MM/DD/YYYY': { re: /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/, order: ['m', 'd', 'y'] },
};

const pad = (n: number) => String(n).padStart(2, '0');

function valid(y: number, m: number, d: number): string | null {
  const iso = `${y}-${pad(m)}-${pad(d)}`;
  try {
    toUtc(iso);
    return iso;
  } catch {
    return null;
  }
}

/** Texto con formato explícito de la plantilla → "AAAA-MM-DD". Ignora una hora al final ("31/10/2026 14:22"). */
export function parseDateText(value: string, format: DateFormat): string | null {
  const { re, order } = PATTERNS[format];
  const m = re.exec(value.trim().split(/[ T]/)[0]!);
  if (!m) return null;
  const parts: Record<string, number> = {};
  order.forEach((k, i) => (parts[k] = Number(m[i + 1])));
  const year = parts.y! < 100 ? 2000 + parts.y! : parts.y!;
  return valid(year, parts.m!, parts.d!);
}

/** Fecha serial de Excel (días desde 1900) → "AAAA-MM-DD", sin pasar por zonas horarias. */
export function parseExcelSerial(serial: number): string | null {
  if (!Number.isFinite(serial) || serial < 1 || serial > 2_958_465) return null;
  const d = XLSX.SSF.parse_date_code(serial);
  return d ? valid(d.y, d.m, d.d) : null;
}
