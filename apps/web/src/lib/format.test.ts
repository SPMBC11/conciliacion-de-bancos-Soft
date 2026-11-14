import { describe, expect, it } from 'vitest';
import { formatDate, formatMoney, greeting } from './format';

describe('formato es-CO', () => {
  it('formatea importes con signo menos visible', () => {
    expect(formatMoney('1234567.89')).toBe('$ 1.234.567,89');
    expect(formatMoney('-4000.00')).toBe('−$ 4.000,00');
    expect(formatMoney('0.00', 'USD')).toBe('US$ 0,00');
  });

  it('formatea fechas DD/MM/AAAA sin desfase de zona horaria', () => {
    expect(formatDate('2026-01-01')).toBe('01/01/2026');
    expect(formatDate('2026-10-31')).toBe('31/10/2026');
  });

  it('saluda según la hora de Bogotá (UTC−5)', () => {
    expect(greeting(new Date('2026-11-13T13:00:00Z'))).toBe('Buenos días'); // 08:00 Bogotá
    expect(greeting(new Date('2026-11-13T20:00:00Z'))).toBe('Buenas tardes'); // 15:00
    expect(greeting(new Date('2026-11-14T02:00:00Z'))).toBe('Buenas noches'); // 21:00
  });
});
