import { describe, expect, it } from 'vitest';
import { formatCOP, parseAmount, sumCents, toAmountString } from './money.js';

describe('money', () => {
  it('parsea y serializa sin perder precisión', () => {
    expect(parseAmount('1234.5')).toBe(123450n);
    expect(parseAmount('-0.01')).toBe(-1n);
    expect(parseAmount('100000')).toBe(10000000n);
    expect(toAmountString(-123450n)).toBe('-1234.50');
    expect(toAmountString(5n)).toBe('0.05');
  });

  it('rechaza entradas ambiguas o con más de 2 decimales', () => {
    for (const bad of ['1,5', '1.234', '', 'abc', '1.2.3']) {
      expect(() => parseAmount(bad)).toThrow('Importe inválido');
    }
  });

  it('formatea en es-CO', () => {
    expect(formatCOP(123456789n)).toBe('1.234.567,89');
    expect(formatCOP(-400000n)).toBe('-4.000,00');
    expect(formatCOP(0n)).toBe('0,00');
  });

  // Prueba financiera 16: 10.000 importes con decimales sin error de redondeo.
  it('suma 10.000 importes de 0,10 exactamente', () => {
    const values = Array.from({ length: 10_000 }, () => parseAmount('0.10'));
    expect(toAmountString(sumCents(values))).toBe('1000.00');
    // Contraste: con Number el resultado no es exacto.
    expect(Array.from({ length: 10_000 }, () => 0.1).reduce((a, b) => a + b, 0)).not.toBe(1000);
  });
});
