/**
 * Calendario colombiano: festivos y días hábiles.
 * Las fechas contables son cadenas ISO "AAAA-MM-DD" sin hora; la aritmética usa UTC para no depender de la zona horaria.
 */
export type IsoDate = string;

export type Holiday = { date: IsoDate; name: string };

const DAY_MS = 86_400_000;

export function toUtc(date: IsoDate): Date {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) throw new Error(`Fecha inválida: "${date}"`);
  const d = new Date(`${date}T00:00:00Z`);
  if (Number.isNaN(d.getTime()) || d.toISOString().slice(0, 10) !== date)
    throw new Error(`Fecha inválida: "${date}"`);
  return d;
}

export const fromUtc = (d: Date): IsoDate => d.toISOString().slice(0, 10);

export const addDays = (date: IsoDate, days: number): IsoDate =>
  fromUtc(new Date(toUtc(date).getTime() + days * DAY_MS));

/** 0 = domingo … 6 = sábado. */
export const weekday = (date: IsoDate) => toUtc(date).getUTCDay();

/** Domingo de Pascua (algoritmo gregoriano anónimo de Meeus/Jones/Butcher). */
export function easterSunday(year: number): IsoDate {
  const a = year % 19;
  const b = Math.floor(year / 100);
  const c = year % 100;
  const d = Math.floor(b / 4);
  const e = b % 4;
  const f = Math.floor((b + 8) / 25);
  const g = Math.floor((b - f + 1) / 3);
  const h = (19 * a + b - d - g + 15) % 30;
  const i = Math.floor(c / 4);
  const k = c % 4;
  const l = (32 + 2 * e + 2 * i - h - k) % 7;
  const m = Math.floor((a + 11 * h + 22 * l) / 451);
  const month = Math.floor((h + l - 7 * m + 114) / 31);
  const day = ((h + l - 7 * m + 114) % 31) + 1;
  return `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
}

/** Ley 51 de 1983 (“Ley Emiliani”): el festivo se traslada al lunes siguiente si no cae en lunes. */
function nextMonday(date: IsoDate): IsoDate {
  const wd = weekday(date);
  return wd === 1 ? date : addDays(date, (8 - wd) % 7);
}

const iso = (year: number, month: number, day: number) =>
  `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;

/** Festivos nacionales de Colombia para un año (18 fechas; pueden coincidir dos en el mismo día). */
export function colombianHolidays(year: number): Holiday[] {
  const easter = easterSunday(year);
  const list: Holiday[] = [
    { date: iso(year, 1, 1), name: 'Año Nuevo' },
    { date: nextMonday(iso(year, 1, 6)), name: 'Día de los Reyes Magos' },
    { date: nextMonday(iso(year, 3, 19)), name: 'Día de San José' },
    { date: addDays(easter, -3), name: 'Jueves Santo' },
    { date: addDays(easter, -2), name: 'Viernes Santo' },
    { date: iso(year, 5, 1), name: 'Día del Trabajo' },
    { date: nextMonday(addDays(easter, 39)), name: 'Ascensión del Señor' },
    { date: nextMonday(addDays(easter, 60)), name: 'Corpus Christi' },
    { date: nextMonday(addDays(easter, 68)), name: 'Sagrado Corazón de Jesús' },
    { date: nextMonday(iso(year, 6, 29)), name: 'San Pedro y San Pablo' },
    { date: iso(year, 7, 20), name: 'Día de la Independencia' },
    { date: iso(year, 8, 7), name: 'Batalla de Boyacá' },
    { date: nextMonday(iso(year, 8, 15)), name: 'Asunción de la Virgen' },
    { date: nextMonday(iso(year, 10, 12)), name: 'Día de la Raza' },
    { date: nextMonday(iso(year, 11, 1)), name: 'Todos los Santos' },
    { date: nextMonday(iso(year, 11, 11)), name: 'Independencia de Cartagena' },
    { date: iso(year, 12, 8), name: 'Inmaculada Concepción' },
    { date: iso(year, 12, 25), name: 'Navidad' },
  ];
  return list.sort((x, y) => x.date.localeCompare(y.date));
}

/** Calendario hábil: lunes a viernes, excluyendo festivos (nacionales + los que agregue la organización). */
export class BusinessCalendar {
  private readonly holidays: Set<IsoDate>;

  constructor(holidays: Iterable<IsoDate>) {
    this.holidays = new Set(holidays);
  }

  /** Calendario con los festivos nacionales de los años indicados más fechas adicionales. */
  static forYears(years: number[], extra: IsoDate[] = []) {
    return new BusinessCalendar([
      ...years.flatMap((y) => colombianHolidays(y).map((h) => h.date)),
      ...extra,
    ]);
  }

  isHoliday(date: IsoDate) {
    return this.holidays.has(date);
  }

  isBusinessDay(date: IsoDate) {
    const wd = weekday(date);
    return wd !== 0 && wd !== 6 && !this.holidays.has(date);
  }

  /**
   * Distancia en días hábiles entre dos fechas (simétrica): cuántos días hábiles hay que avanzar desde la menor
   * para llegar a la mayor. Misma fecha = 0. Un fin de semana o festivo intermedio no cuenta.
   */
  businessDaysBetween(a: IsoDate, b: IsoDate): number {
    const to = a <= b ? b : a;
    let from = a <= b ? a : b;
    let count = 0;
    while (from < to) {
      from = addDays(from, 1);
      if (this.isBusinessDay(from)) count++;
    }
    return count;
  }

  /** Suma N días hábiles (N ≥ 0) a una fecha. */
  addBusinessDays(date: IsoDate, n: number): IsoDate {
    let d = date;
    for (let added = 0; added < n;) {
      d = addDays(d, 1);
      if (this.isBusinessDay(d)) added++;
    }
    return d;
  }
}
