import { formatCOP, parseAmount } from '@finagent/domain';

export type Currency = 'COP' | 'USD';

const SYMBOL: Record<Currency, string> = { COP: '$', USD: 'US$' };

/**
 * "-4000.00" (formato API) → "−$ 4.000,00". Nunca convierte a Number.
 * Usa el signo menos tipográfico (U+2212) para que el negativo sea visible además del color.
 */
export function formatMoney(amount: string, currency: Currency = 'COP'): string {
  const cents = parseAmount(amount);
  const body = formatCOP(cents < 0n ? -cents : cents);
  return `${cents < 0n ? '−' : ''}${SYMBOL[currency]} ${body}`;
}

export function isNegative(amount: string) {
  return parseAmount(amount) < 0n;
}

/** "2026-10-31" → "31/10/2026". Fechas contables sin hora: no hay conversión de zona horaria. */
export function formatDate(isoDate: string): string {
  const [y, m, d] = isoDate.slice(0, 10).split('-');
  return `${d}/${m}/${y}`;
}

export const MONTHS = [
  'Enero',
  'Febrero',
  'Marzo',
  'Abril',
  'Mayo',
  'Junio',
  'Julio',
  'Agosto',
  'Septiembre',
  'Octubre',
  'Noviembre',
  'Diciembre',
] as const;

/** Hora actual en Bogotá (la UI siempre muestra America/Bogota). */
export function bogotaHour(now = new Date()): number {
  return Number(
    new Intl.DateTimeFormat('es-CO', {
      hour: 'numeric',
      hourCycle: 'h23',
      timeZone: 'America/Bogota',
    }).format(now),
  );
}

export function greeting(now = new Date()): string {
  const h = bogotaHour(now);
  return h < 12 ? 'Buenos días' : h < 19 ? 'Buenas tardes' : 'Buenas noches';
}

/**
 * Importe escrito por el usuario en formato colombiano → string de API, sin pasar por Number.
 * "1.234.567,89" → "1234567.89" · "-4.000" → "-4000" · "15000,5" → "15000.5". Inválido → null.
 * El punto es separador de miles y la coma, decimal (es-CO).
 */
export function parseLocalAmount(input: string): string | null {
  const s = input.trim().replace(/\s|\$/g, '').replace('−', '-');
  const m = /^(-)?(\d{1,3}(?:\.\d{3})*|\d+)(?:,(\d{1,2}))?$/.exec(s);
  if (!m) return null;
  const [, sign = '', int, frac] = m;
  const digits = int!.replace(/\./g, '').replace(/^0+(?=\d)/, '');
  return `${sign}${digits}${frac ? `.${frac}` : ''}`;
}

/** String de API → texto editable en formato colombiano ("1234567.89" → "1.234.567,89"). */
export function toLocalAmountInput(amount: string): string {
  return formatMoney(amount).replace(/^−?(\$|US\$) /, amount.startsWith('-') ? '-' : '');
}
