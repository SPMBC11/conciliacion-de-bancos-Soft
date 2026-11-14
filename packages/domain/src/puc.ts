/**
 * Plan Único de Cuentas (Decreto 2650 de 1993, referencia).
 * Estructura por longitud del código: 1 clase · 2 grupo · 4 cuenta · 6 subcuenta · 8+ auxiliar.
 */
export type PucNature = 'DEBITO' | 'CREDITO';

const LEVEL_BY_LENGTH: Record<number, number> = { 1: 1, 2: 2, 4: 3, 6: 4 };

export function pucLevel(code: string): number {
  if (!/^\d{1,12}$/.test(code)) throw new Error(`Código PUC inválido: "${code}"`);
  const level =
    LEVEL_BY_LENGTH[code.length] ?? (code.length >= 8 && code.length % 2 === 0 ? 5 : undefined);
  if (level === undefined)
    throw new Error(`Longitud de código PUC no válida (${code.length} dígitos): "${code}"`);
  return level;
}

/** Naturaleza por clase: 1, 5, 6, 7 y 8 débito; 2, 3, 4 y 9 crédito. */
export function defaultNature(code: string): PucNature {
  return ['2', '3', '4', '9'].includes(code[0]!) ? 'CREDITO' : 'DEBITO';
}

/** Código del padre inmediato (null para una clase). */
export function pucParent(code: string): string | null {
  const level = pucLevel(code);
  if (level === 1) return null;
  if (level === 2) return code.slice(0, 1);
  if (level === 3) return code.slice(0, 2);
  if (level === 4) return code.slice(0, 4);
  return code.slice(0, code.length - 2);
}

export const PUC_LEVEL_NAMES = {
  1: 'Clase',
  2: 'Grupo',
  3: 'Cuenta',
  4: 'Subcuenta',
  5: 'Auxiliar',
} as const;
