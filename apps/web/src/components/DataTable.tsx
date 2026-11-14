import {
  type ColumnDef,
  flexRender,
  getCoreRowModel,
  getFilteredRowModel,
  getPaginationRowModel,
  getSortedRowModel,
  type RowSelectionState,
  type SortingState,
  useReactTable,
} from '@tanstack/react-table';
import { ArrowDown, ArrowUp, ArrowUpDown, ChevronLeft, ChevronRight } from 'lucide-react';
import { type ReactNode, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { EmptyState, ErrorState, LoadingState } from '@/components/States';
import { SearchInput } from '@/components/SearchInput';
import { FilterBar } from '@/components/FilterBar';
import { cn } from '@/lib/utils';

declare module '@tanstack/react-table' {
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  interface ColumnMeta<TData, TValue> {
    /** Columnas de importes: alineadas a la derecha. */
    align?: 'left' | 'right';
  }
}

type DataTableProps<T> = {
  columns: ColumnDef<T, unknown>[];
  data: T[];
  /** Nombre accesible de la tabla. */
  caption: string;
  isLoading?: boolean;
  error?: string | null;
  onRetry?: () => void;
  empty?: { title: string; description?: ReactNode; action?: ReactNode };
  searchPlaceholder?: string;
  filters?: ReactNode;
  pageSize?: number;
  selectable?: boolean;
  onSelectionChange?: (rows: T[]) => void;
};

/**
 * Tabla base con búsqueda, orden, paginación y selección múltiple (cliente).
 * La mesa de trabajo (Fase 7) usará paginación del servidor + virtualización para 50.000+ filas.
 */
export function DataTable<T>({
  columns,
  data,
  caption,
  isLoading,
  error,
  onRetry,
  empty = { title: 'No hay registros' },
  searchPlaceholder = 'Buscar…',
  filters,
  pageSize = 25,
  selectable,
  onSelectionChange,
}: DataTableProps<T>) {
  const [sorting, setSorting] = useState<SortingState>([]);
  const [globalFilter, setGlobalFilter] = useState('');
  const [rowSelection, setRowSelection] = useState<RowSelectionState>({});

  const table = useReactTable({
    data,
    columns,
    state: { sorting, globalFilter, rowSelection },
    enableRowSelection: !!selectable,
    onSortingChange: setSorting,
    onGlobalFilterChange: setGlobalFilter,
    onRowSelectionChange: (updater) => {
      const next = typeof updater === 'function' ? updater(rowSelection) : updater;
      setRowSelection(next);
      onSelectionChange?.(data.filter((_, i) => next[i]));
    },
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
    getFilteredRowModel: getFilteredRowModel(),
    getPaginationRowModel: getPaginationRowModel(),
    initialState: { pagination: { pageSize } },
  });

  const rows = table.getRowModel().rows;
  const total = table.getFilteredRowModel().rows.length;
  const { pageIndex } = table.getState().pagination;
  const selectedCount = Object.keys(rowSelection).length;

  let body: ReactNode;
  if (isLoading) body = <LoadingState rows={5} />;
  else if (error) body = <ErrorState message={error} onRetry={onRetry} />;
  else if (data.length === 0) body = <EmptyState {...empty} />;
  else if (total === 0)
    body = (
      <EmptyState title="Sin resultados" description="Ningún registro coincide con la búsqueda." />
    );

  return (
    <Card className="overflow-hidden">
      <div className="border-b border-border p-3">
        <FilterBar>
          <SearchInput
            aria-label="Buscar en la tabla"
            placeholder={searchPlaceholder}
            value={globalFilter}
            onChange={(e) => setGlobalFilter(e.target.value)}
            className="sm:w-72"
          />
          {filters}
          {selectable && selectedCount > 0 && (
            <span className="text-sm text-muted-foreground sm:ml-auto">
              {selectedCount} seleccionados
            </span>
          )}
        </FilterBar>
      </div>

      {body ?? (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <caption className="sr-only">{caption}</caption>
            <thead className="bg-surface-secondary/60 text-left text-xs text-muted-foreground">
              {table.getHeaderGroups().map((hg) => (
                <tr key={hg.id}>
                  {selectable && (
                    <th className="w-10 px-3 py-2">
                      <input
                        type="checkbox"
                        aria-label="Seleccionar todos"
                        checked={table.getIsAllPageRowsSelected()}
                        onChange={table.getToggleAllPageRowsSelectedHandler()}
                      />
                    </th>
                  )}
                  {hg.headers.map((h) => {
                    const sorted = h.column.getIsSorted();
                    const right = h.column.columnDef.meta?.align === 'right';
                    return (
                      <th
                        key={h.id}
                        scope="col"
                        aria-sort={
                          sorted === 'asc'
                            ? 'ascending'
                            : sorted === 'desc'
                              ? 'descending'
                              : undefined
                        }
                        className={cn(
                          'px-3 py-2 font-medium whitespace-nowrap',
                          right && 'text-right',
                        )}
                      >
                        {h.column.getCanSort() ? (
                          <button
                            type="button"
                            onClick={h.column.getToggleSortingHandler()}
                            className={cn(
                              'inline-flex items-center gap-1 hover:text-foreground',
                              right && 'flex-row-reverse',
                            )}
                          >
                            {flexRender(h.column.columnDef.header, h.getContext())}
                            {sorted === 'asc' ? (
                              <ArrowUp aria-hidden className="size-3" />
                            ) : sorted === 'desc' ? (
                              <ArrowDown aria-hidden className="size-3" />
                            ) : (
                              <ArrowUpDown aria-hidden className="size-3 opacity-50" />
                            )}
                          </button>
                        ) : (
                          flexRender(h.column.columnDef.header, h.getContext())
                        )}
                      </th>
                    );
                  })}
                </tr>
              ))}
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr
                  key={row.id}
                  className={cn(
                    'border-t border-border hover:bg-surface-secondary/50',
                    row.getIsSelected() && 'bg-primary/5',
                  )}
                >
                  {selectable && (
                    <td className="px-3 py-2">
                      <input
                        type="checkbox"
                        aria-label="Seleccionar fila"
                        checked={row.getIsSelected()}
                        onChange={row.getToggleSelectedHandler()}
                      />
                    </td>
                  )}
                  {row.getVisibleCells().map((cell) => (
                    <td
                      key={cell.id}
                      className={cn(
                        'px-3 py-2',
                        cell.column.columnDef.meta?.align === 'right' && 'text-right',
                      )}
                    >
                      {flexRender(cell.column.columnDef.cell, cell.getContext())}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {!body && table.getPageCount() > 1 && (
        <div className="flex items-center justify-between gap-2 border-t border-border px-3 py-2 text-sm text-muted-foreground">
          <span>
            Página {pageIndex + 1} de {table.getPageCount()} · {total} registros
          </span>
          <div className="flex gap-1">
            <Button
              variant="ghost"
              size="icon"
              aria-label="Página anterior"
              disabled={!table.getCanPreviousPage()}
              onClick={() => table.previousPage()}
            >
              <ChevronLeft />
            </Button>
            <Button
              variant="ghost"
              size="icon"
              aria-label="Página siguiente"
              disabled={!table.getCanNextPage()}
              onClick={() => table.nextPage()}
            >
              <ChevronRight />
            </Button>
          </div>
        </div>
      )}
    </Card>
  );
}
