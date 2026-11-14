import { type Cents, parseAmount } from '@finagent/domain';

export type DecimalSeparator = ',' | '.';

/**
 * Importe escrito en un archivo → centavos. Nunca usa Number para textos.
 * Admite: "1.234.567,89" / "1,234,567.89" (según separador), "$ 1.234", "(1.234,00)" y "1.234,00-" (negativos),
 * prefijos de moneda (COP, USD, $). Rechaza ambigüedades y más de 2 decimales.
 */
export function parseAmountText(value: string, decimal: DecimalSeparator): Cents | null {
  let s = value
    .trim()
    .toUpperCase()
    .replace(/\s+/g, '')
    .replace(/^(COP|USD|US\$|\$)/, '')
    .replace(/\$/g, '');
  if (!s) return null;
  let negative = false;
  if (/^\(.*\)$/.test(s)) [negative, s] = [true, s.slice(1, -1)];
  if (s.endsWith('-')) [negative, s] = [true, s.slice(0, -1)];
  if (s.startsWith('-')) [negative, s] = [!negative, s.slice(1)];
  if (s.startsWith('+')) s = s.slice(1);
  const group = decimal === ',' ? '.' : ',';
  const re = new RegExp(`^(\\d{1,3}(?:\\${group}\\d{3})+|\\d+)(?:\\${decimal}(\\d{1,2}))?$`);
  const m = re.exec(s);
  if (!m) return null;
  const cents = parseAmount(`${m[1]!.split(group).join('')}${m[2] ? `.${m[2]}` : ''}`);
  return negative ? -cents : cents;
}

/**
 * Número binario de una celda de Excel → centavos. Excel guarda los importes como coma flotante;
 * se acepta solo si representa un valor con máximo 2 decimales (tolerancia de redondeo binario).
 */
export function parseAmountNumber(value: number): Cents | null {
  if (!Number.isFinite(value) || Math.abs(value) >= 1e15) return null;
  const scaled = value * 100;
  const rounded = Math.round(scaled);
  if (Math.abs(scaled - rounded) > 1e-6 * Math.max(1, Math.abs(scaled))) return null;
  return BigInt(rounded);
}
