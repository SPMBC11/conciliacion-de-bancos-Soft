import { describe, expect, it } from 'vitest';
import { suggestMatches, type MatchTransaction } from './reconciliation.js';

const tx = (
  id: string,
  side: 'BANK' | 'BOOK',
  amountCents: bigint,
  fields: Partial<MatchTransaction> = {},
): MatchTransaction => ({
  id,
  side,
  amountCents,
  currency: 'COP',
  date: '2026-10-06',
  description: 'PAGO PROVEEDOR ACME',
  ...fields,
});

describe('motor determinista de conciliación', () => {
  it('propone coincidencia exacta con importe, moneda, fecha y referencia', () => {
    const result = suggestMatches([
      tx('b1', 'BANK', -125_000n, { reference: 'FAC-2026-18' }),
      tx('k1', 'BOOK', 125_000n, { reference: 'FAC-2026-18' }),
    ]);
    expect(result).toHaveLength(1);
    expect(result[0]).toMatchObject({ status: 'EXACT', rule: 'EXACT', score: 100 });
    expect(result[0]?.amountDifferenceCents).toBe(0n);
  });

  it('marca como ambigua una coincidencia exacta con dos candidatos', () => {
    const result = suggestMatches([
      tx('b1', 'BANK', -125_000n, { reference: 'FAC-2026-18' }),
      tx('k1', 'BOOK', 125_000n, { reference: 'FAC-2026-18' }),
      tx('k2', 'BOOK', 125_000n, { reference: 'FAC-2026-18' }),
    ]);
    expect(result[0]?.status).toBe('AMBIGUOUS');
    expect(result[0]?.bookTransactionIds).toEqual(['k1', 'k2']);
  });

  it('acepta la regla 2 solo dentro de la tolerancia de días hábiles', () => {
    const result = suggestMatches([
      tx('b1', 'BANK', -125_000n, { reference: 'REC-4481', date: '2026-10-09' }),
      tx('k1', 'BOOK', 125_000n, { reference: 'REC-4481', date: '2026-10-13' }),
    ]);
    expect(result[0]).toMatchObject({
      rule: 'BUSINESS_DATE',
      status: 'PROBABLE',
      dateDifferenceBusinessDays: 1,
    });
  });

  it('detecta diferencias de fecha fuera de tolerancia sin ocultarlas como sin correspondencia', () => {
    const result = suggestMatches([
      tx('b1', 'BANK', -125_000n, { reference: 'REC-4481', date: '2026-10-01' }),
      tx('k1', 'BOOK', 125_000n, { reference: 'REC-4481', date: '2026-10-13' }),
    ]);
    expect(result[0]?.status).toBe('DATE_DIFFERENCE');
  });

  it('concilia una suma acotada 1:N sin perder exactitud en centavos', () => {
    const result = suggestMatches([
      tx('b1', 'BANK', -10_001n),
      tx('k1', 'BOOK', 4_000n),
      tx('k2', 'BOOK', 6_001n),
    ]);
    expect(result.find((x) => x.rule === 'GROUP_SUM')).toMatchObject({
      status: 'PROBABLE',
      bankTransactionIds: ['b1'],
      bookTransactionIds: ['k1', 'k2'],
    });
  });

  it('no crea coincidencias entre monedas distintas', () => {
    const result = suggestMatches([
      tx('b1', 'BANK', -100_000n, { reference: 'R1' }),
      tx('k1', 'BOOK', 100_000n, { reference: 'R1', currency: 'USD' }),
    ]);
    expect(result.map((x) => x.status)).toEqual(['BANK_UNMATCHED', 'BOOK_UNMATCHED']);
  });

  it('clasifica notas bancarias sin proponer un asiento contable', () => {
    const result = suggestMatches([tx('b1', 'BANK', -450n, { description: 'GMF 4 X 1000' })]);
    expect(result[0]).toMatchObject({
      status: 'BANK_FEE',
      rule: 'FEE_CLASSIFICATION',
      feeType: 'GMF',
    });
    expect(result[0]?.bookTransactionIds).toEqual([]);
  });

  it('conserva posibles duplicados y arrastra pendientes anteriores', () => {
    const result = suggestMatches([
      tx('b1', 'BANK', -900n, { duplicateStatus: 'POSSIBLE' }),
      tx('b2', 'BANK', -800n, { carryover: true }),
    ]);
    expect(result.map((x) => x.status)).toEqual(['POSSIBLE_DUPLICATE', 'CARRIED_FORWARD']);
  });
});
