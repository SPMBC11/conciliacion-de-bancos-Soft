/**
 * Dinero exacto en unidades mínimas (centavos) como bigint.
 * Nunca usar Number para importes: 0.1 + 0.2 !== 0.3.
 * En la API y la BD el dinero viaja como string decimal con punto ("-1234.56").
 */
export type Cents = bigint;

const DECIMAL_RE = /^(-)?(\d+)(?:\.(\d{1,2}))?$/;

/** "1234.5" → 123450n. Rechaza más de 2 decimales para no redondear en silencio. */
export function parseAmount(value: string): Cents {
  const m = DECIMAL_RE.exec(value.trim());
  if (!m) throw new Error(`Importe inválido: "${value}"`);
  const [, sign, int, frac = ''] = m;
  const cents = BigInt(int!) * 100n + BigInt(frac.padEnd(2, '0'));
  return sign ? -cents : cents;
}

/** 123450n → "1234.50" (formato de API/BD). */
export function toAmountString(cents: Cents): string {
  const neg = cents < 0n;
  const abs = neg ? -cents : cents;
  const frac = (abs % 100n).toString().padStart(2, '0');
  return `${neg ? '-' : ''}${abs / 100n}.${frac}`;
}

export function sumCents(values: Iterable<Cents>): Cents {
  let total = 0n;
  for (const v of values) total += v;
  return total;
}

/** 123456789n → "1.234.567,89" (es-CO). Sin símbolo; la UI decide si lo muestra. */
export function formatCOP(cents: Cents): string {
  const [int, frac] = toAmountString(cents).replace('-', '').split('.') as [string, string];
  const grouped = int.replace(/\B(?=(\d{3})+(?!\d))/g, '.');
  return `${cents < 0n ? '-' : ''}${grouped},${frac}`;
}
