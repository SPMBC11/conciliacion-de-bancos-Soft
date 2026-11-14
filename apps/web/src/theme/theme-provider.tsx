import { createContext, type ReactNode, useContext, useEffect, useState } from 'react';
import { readPref, writePref } from '@/lib/storage';

export type ThemePreference = 'light' | 'dark' | 'system';

type ThemeContextValue = {
  preference: ThemePreference;
  resolved: 'light' | 'dark';
  setPreference: (p: ThemePreference) => void;
};

const ThemeContext = createContext<ThemeContextValue | null>(null);

const systemQuery = () => window.matchMedia('(prefers-color-scheme: dark)');

function resolve(p: ThemePreference): 'light' | 'dark' {
  if (p !== 'system') return p;
  return systemQuery().matches ? 'dark' : 'light';
}

function initialPreference(): ThemePreference {
  const saved = readPref('theme');
  return saved === 'light' || saved === 'dark' ? saved : 'system';
}

export function ThemeProvider({ children }: { children: ReactNode }) {
  const [preference, setPreferenceState] = useState<ThemePreference>(initialPreference);
  const [resolved, setResolved] = useState(() => resolve(preference));

  useEffect(() => {
    const apply = () => {
      const r = resolve(preference);
      setResolved(r);
      document.documentElement.dataset.theme = r;
    };
    apply();
    if (preference !== 'system') return;
    const mq = systemQuery();
    mq.addEventListener('change', apply);
    return () => mq.removeEventListener('change', apply);
  }, [preference]);

  const setPreference = (p: ThemePreference) => {
    writePref('theme', p);
    setPreferenceState(p);
  };

  return (
    <ThemeContext.Provider value={{ preference, resolved, setPreference }}>
      {children}
    </ThemeContext.Provider>
  );
}

export function useTheme() {
  const ctx = useContext(ThemeContext);
  if (!ctx) throw new Error('useTheme debe usarse dentro de ThemeProvider');
  return ctx;
}
