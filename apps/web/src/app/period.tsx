import { createContext, type ReactNode, useContext, useState } from 'react';
import { readPref, writePref } from '@/lib/storage';

export type Period = { year: number; month: number }; // month 1–12

type PeriodContextValue = { period: Period; setPeriod: (p: Period) => void };

const PeriodContext = createContext<PeriodContextValue | null>(null);

function currentBogotaPeriod(): Period {
  const [y, m] = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Bogota',
    year: 'numeric',
    month: '2-digit',
  })
    .format(new Date())
    .split('-');
  return { year: Number(y), month: Number(m) };
}

function initial(): Period {
  const saved = readPref('period');
  const m = saved && /^(\d{4})-(\d{2})$/.exec(saved);
  return m ? { year: Number(m[1]), month: Number(m[2]) } : currentBogotaPeriod();
}

/** Periodo de trabajo seleccionado en el encabezado (filtra dashboard e informes). */
export function PeriodProvider({ children }: { children: ReactNode }) {
  const [period, setState] = useState(initial);
  const setPeriod = (p: Period) => {
    writePref('period', `${p.year}-${String(p.month).padStart(2, '0')}`);
    setState(p);
  };
  return <PeriodContext.Provider value={{ period, setPeriod }}>{children}</PeriodContext.Provider>;
}

export function usePeriod() {
  const ctx = useContext(PeriodContext);
  if (!ctx) throw new Error('usePeriod debe usarse dentro de PeriodProvider');
  return ctx;
}
