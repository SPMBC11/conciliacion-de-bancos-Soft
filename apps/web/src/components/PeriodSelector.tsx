import { CalendarDays } from 'lucide-react';
import { usePeriod } from '@/app/period';
import { NativeSelect } from '@/components/ui/input';
import { MONTHS } from '@/lib/format';

export function PeriodSelector() {
  const { period, setPeriod } = usePeriod();
  const thisYear = new Date().getFullYear();
  const years = Array.from({ length: 6 }, (_, i) => thisYear - 4 + i);
  return (
    <div className="flex items-center gap-1" role="group" aria-label="Periodo de trabajo">
      <CalendarDays aria-hidden className="hidden size-4 text-muted-foreground sm:block" />
      <NativeSelect
        aria-label="Mes"
        value={period.month}
        onChange={(e) => setPeriod({ ...period, month: Number(e.target.value) })}
        className="h-8 px-2"
      >
        {MONTHS.map((m, i) => (
          <option key={m} value={i + 1}>
            {m}
          </option>
        ))}
      </NativeSelect>
      <NativeSelect
        aria-label="Año"
        value={period.year}
        onChange={(e) => setPeriod({ ...period, year: Number(e.target.value) })}
        className="h-8 px-2"
      >
        {years.map((y) => (
          <option key={y} value={y}>
            {y}
          </option>
        ))}
      </NativeSelect>
    </div>
  );
}
