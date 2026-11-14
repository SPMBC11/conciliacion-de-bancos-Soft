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
