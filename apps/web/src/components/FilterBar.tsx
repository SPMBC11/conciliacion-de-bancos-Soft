import type { ReactNode } from 'react';

/** Contenedor de filtros: en móvil se apilan, en escritorio van en línea. */
export function FilterBar({ children }: { children: ReactNode }) {
  return (
    <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:items-center">{children}</div>
  );
}
