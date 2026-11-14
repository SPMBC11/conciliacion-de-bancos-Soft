import { describe, expect, it } from 'vitest';
import { addDays, BusinessCalendar, colombianHolidays, easterSunday, toUtc } from './calendar.js';

const dates = (year: number) => colombianHolidays(year).map((h) => h.date);

describe('festivos de Colombia', () => {
  it('calcula el domingo de Pascua', () => {
    expect(easterSunday(2024)).toBe('2024-03-31');
    expect(easterSunday(2025)).toBe('2025-04-20');
    expect(easterSunday(2026)).toBe('2026-04-05');
    expect(easterSunday(2027)).toBe('2027-03-28');
  });

  it('2026: 18 festivos oficiales', () => {
    expect(dates(2026)).toEqual([
      '2026-01-01',
      '2026-01-12',
      '2026-03-23',
      '2026-04-02',
      '2026-04-03',
      '2026-05-01',
      '2026-05-18',
      '2026-06-08',
      '2026-06-15',
      '2026-06-29',
      '2026-07-20',
      '2026-08-07',
      '2026-08-17',
      '2026-10-12',
      '2026-11-02',
      '2026-11-16',
      '2026-12-08',
      '2026-12-25',
    ]);
  });

  it('2025: Sagrado Corazón y San Pedro coinciden el 30 de junio', () => {
    const list = dates(2025);
    expect(new Set(list)).toEqual(
      new Set([
        '2025-01-01',
        '2025-01-06',
        '2025-03-24',
        '2025-04-17',
        '2025-04-18',
        '2025-05-01',
        '2025-06-02',
        '2025-06-23',
        '2025-06-30',
        '2025-07-20',
        '2025-08-07',
        '2025-08-18',
        '2025-10-13',
        '2025-11-03',
        '2025-11-17',
        '2025-12-08',
        '2025-12-25',
      ]),
    );
    expect(list.filter((d) => d === '2025-06-30')).toHaveLength(2);
  });

  it('los festivos trasladables siempre caen en lunes', () => {
    for (const year of [2024, 2025, 2026, 2027, 2028]) {
      for (const h of colombianHolidays(year)) {
        if (
          /Reyes|San José|Ascensión|Corpus|Sagrado|San Pedro|Asunción|Raza|Todos|Cartagena/.test(
            h.name,
          )
        ) {
          expect(toUtc(h.date).getUTCDay(), `${h.name} ${h.date}`).toBe(1);
        }
      }
    }
  });
});

describe('días hábiles', () => {
  const cal = BusinessCalendar.forYears([2026]);

  it('sábados, domingos y festivos no son hábiles', () => {
    expect(cal.isBusinessDay('2026-11-13')).toBe(true); // viernes
    expect(cal.isBusinessDay('2026-11-14')).toBe(false); // sábado
    expect(cal.isBusinessDay('2026-11-15')).toBe(false); // domingo
    expect(cal.isBusinessDay('2026-11-16')).toBe(false); // festivo (Independencia de Cartagena)
    expect(cal.isHoliday('2026-11-16')).toBe(true);
  });

  // Prueba financiera 4: una diferencia de 3 días calendario que incluye festivo se mide en días hábiles.
  it('prueba 4: viernes 13 → martes 17 de noviembre de 2026 = 1 día hábil (fin de semana + festivo)', () => {
    expect(cal.businessDaysBetween('2026-11-13', '2026-11-17')).toBe(1);
    expect(cal.businessDaysBetween('2026-11-17', '2026-11-13')).toBe(1); // simétrica
    expect(cal.businessDaysBetween('2026-11-10', '2026-11-13')).toBe(3);
    expect(cal.businessDaysBetween('2026-11-13', '2026-11-13')).toBe(0);
  });

  it('suma días hábiles saltando festivos', () => {
    expect(cal.addBusinessDays('2026-11-13', 1)).toBe('2026-11-17');
    expect(cal.addBusinessDays('2026-04-01', 1)).toBe('2026-04-06'); // Jueves y Viernes Santo
    expect(cal.addBusinessDays('2026-04-01', 0)).toBe('2026-04-01');
  });

  it('acepta festivos adicionales de la organización', () => {
    const custom = BusinessCalendar.forYears([2026], ['2026-11-13']);
    expect(custom.isBusinessDay('2026-11-13')).toBe(false);
  });

  it('rechaza fechas inválidas', () => {
    expect(() => toUtc('2026-02-30')).toThrow('Fecha inválida');
    expect(() => toUtc('13/11/2026')).toThrow('Fecha inválida');
    expect(addDays('2026-12-31', 1)).toBe('2027-01-01');
  });
});
