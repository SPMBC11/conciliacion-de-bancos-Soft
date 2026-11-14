import {
  DATE_FORMAT_OPTIONS,
  type LedgerSide,
  type TemplateConfigInput,
} from '@finagent/contracts';
import { Input, NativeSelect, Textarea } from '@/components/ui/input';
import { cn } from '@/lib/utils';
import type { Grid } from './api';
import { colName, FIELD_LABELS, type FieldKey, fieldsFor } from './mapping';

type Props = {
  grid: Grid;
  side: LedgerSide;
  config: TemplateConfigInput;
  onChange: (c: TemplateConfigInput) => void;
};

const FIELD_TONE: Partial<Record<FieldKey, string>> = {
  date: 'bg-primary/10',
  description: 'bg-primary/10',
  debit: 'bg-danger/10',
  credit: 'bg-success/12',
  amount: 'bg-warning/15',
  balance: 'bg-surface-secondary',
};

/** Mapeador visual: el usuario indica qué columna del archivo corresponde a cada campo. */
export function ColumnMapper({ grid, side, config, onChange }: Props) {
  const sheet = grid.sheets[config.sheetIndex ?? 0] ?? grid.sheets[0]!;
  const width = Math.max(...sheet.rows.map((r) => r.length), 1);
  const header = config.headerRow ? sheet.rows[config.headerRow - 1] : undefined;
  const label = (i: number) =>
    `${colName(i)}${header?.[i] ? ` · ${String(header[i]).slice(0, 24)}` : ''}`;
  const set = (patch: Partial<TemplateConfigInput>) => onChange({ ...config, ...patch });
  const setCol = (field: FieldKey, v: string) => {
    const columns = { ...config.columns };
    if (v === '') delete columns[field];
    else columns[field] = Number(v);
    set({ columns: columns as TemplateConfigInput['columns'] });
  };
  const fieldOf = (i: number) =>
    (Object.entries(config.columns) as [FieldKey, number][]).find(([, c]) => c === i)?.[0];

  return (
    <div className="space-y-4">
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {grid.sheets.length > 1 && (
          <label className="space-y-1 text-sm font-medium">
            Hoja
            <NativeSelect
              aria-label="Hoja"
              className="w-full"
              value={config.sheetIndex ?? 0}
              onChange={(e) => set({ sheetIndex: Number(e.target.value) })}
            >
              {grid.sheets.map((s, i) => (
                <option key={s.name} value={i}>
                  {s.name}
                </option>
              ))}
            </NativeSelect>
          </label>
        )}
        <label className="space-y-1 text-sm font-medium">
          Fila del encabezado
          <Input
            type="number"
            min={1}
            value={config.headerRow ?? ''}
            onChange={(e) => set({ headerRow: e.target.value ? Number(e.target.value) : null })}
          />
        </label>
        <label className="space-y-1 text-sm font-medium">
          Primera fila de datos
          <Input
            type="number"
            min={1}
            value={config.startRow}
            onChange={(e) => set({ startRow: Number(e.target.value) || 1 })}
          />
        </label>
        <label className="space-y-1 text-sm font-medium">
          Formato de fecha
          <NativeSelect
            aria-label="Formato de fecha"
            className="w-full"
            value={config.dateFormat}
            onChange={(e) =>
              set({ dateFormat: e.target.value as TemplateConfigInput['dateFormat'] })
            }
          >
            {DATE_FORMAT_OPTIONS.map((f) => (
              <option key={f} value={f}>
                {f.replace(/D/g, 'D').replace('YYYY', 'AAAA').replace('YY', 'AA')}
              </option>
            ))}
          </NativeSelect>
        </label>
        <label className="space-y-1 text-sm font-medium">
          Separador decimal
          <NativeSelect
            aria-label="Separador decimal"
            className="w-full"
            value={config.decimalSeparator}
            onChange={(e) => set({ decimalSeparator: e.target.value as ',' | '.' })}
          >
            <option value=",">Coma (1.234,56)</option>
            <option value=".">Punto (1,234.56)</option>
          </NativeSelect>
        </label>
        <label className="space-y-1 text-sm font-medium">
          Importes
          <NativeSelect
            aria-label="Importes"
            className="w-full"
            value={config.amountMode}
            onChange={(e) =>
              set({ amountMode: e.target.value as TemplateConfigInput['amountMode'] })
            }
          >
            <option value="DEBIT_CREDIT">Columnas débito y crédito</option>
            <option value="SIGNED">Una columna con signo</option>
          </NativeSelect>
        </label>
        {config.amountMode === 'SIGNED' && (
          <label className="space-y-1 text-sm font-medium">
            Un valor positivo es…
            <NativeSelect
              aria-label="Un valor positivo es"
              className="w-full"
              value={config.signedPositiveIs ?? 'INFLOW'}
              onChange={(e) => set({ signedPositiveIs: e.target.value as 'INFLOW' | 'OUTFLOW' })}
            >
              <option value="INFLOW">Entrada a la cuenta</option>
              <option value="OUTFLOW">Salida de la cuenta</option>
            </NativeSelect>
          </label>
        )}
      </div>

      <fieldset className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <legend className="mb-2 text-sm font-semibold">Columnas</legend>
        {fieldsFor(side, config.amountMode).map((field) => (
          <label key={field} className="space-y-1 text-sm font-medium">
            {FIELD_LABELS[field]}
            <NativeSelect
              aria-label={FIELD_LABELS[field].replace(' *', '')}
              className="w-full"
              value={config.columns[field] ?? ''}
              onChange={(e) => setCol(field, e.target.value)}
            >
              <option value="">
                {field === 'date' || field === 'description' ? 'Seleccione…' : 'No aplica'}
              </option>
              {Array.from({ length: width }, (_, i) => (
                <option key={i} value={i}>
                  {label(i)}
                </option>
              ))}
            </NativeSelect>
          </label>
        ))}
      </fieldset>
      <p className="text-xs text-muted-foreground">
        {side === 'BANK'
          ? 'Extracto: el débito es salida de dinero y el crédito, entrada.'
          : 'Auxiliar de la cuenta banco (activo): el débito es entrada de dinero y el crédito, salida.'}
      </p>

      <label className="block space-y-1 text-sm font-medium">
        Filas a omitir (una expresión por línea; ej. totales y saldos)
        <Textarea
          rows={2}
          value={(config.skipRowPatterns ?? []).join('\n')}
          onChange={(e) =>
            set({
              skipRowPatterns: e.target.value
                .split('\n')
                .map((s) => s.trim())
                .filter(Boolean),
            })
          }
        />
      </label>

      <div className="overflow-auto rounded-lg border border-border">
        <table className="w-full text-xs">
          <caption className="sr-only">Primeras filas del archivo</caption>
          <thead className="sticky top-0 bg-surface-secondary text-muted-foreground">
            <tr>
              <th className="px-2 py-1 text-right">#</th>
              {Array.from({ length: width }, (_, i) => (
                <th
                  key={i}
                  scope="col"
                  className={cn(
                    'px-2 py-1 text-left font-medium whitespace-nowrap',
                    fieldOf(i) && FIELD_TONE[fieldOf(i)!],
                  )}
                >
                  {colName(i)}
                  {fieldOf(i) && (
                    <span className="ml-1 text-foreground">
                      → {FIELD_LABELS[fieldOf(i)!].replace(' *', '')}
                    </span>
                  )}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {sheet.rows.map((r, ri) => {
              const n = ri + 1;
              const isHeader = n === config.headerRow;
              const isData = n >= config.startRow;
              return (
                <tr
                  key={ri}
                  className={cn(
                    'border-t border-border',
                    isHeader && 'font-semibold',
                    !isData && !isHeader && 'text-muted-foreground',
                  )}
                >
                  <td className="px-2 py-1 text-right tabular text-muted-foreground">{n}</td>
                  {Array.from({ length: width }, (_, ci) => (
                    <td
                      key={ci}
                      className={cn(
                        'px-2 py-1 whitespace-nowrap',
                        isData && fieldOf(ci) && FIELD_TONE[fieldOf(ci)!],
                      )}
                    >
                      {r[ci] ?? ''}
                    </td>
                  ))}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <p className="text-xs text-muted-foreground">
        Mostrando {sheet.rows.length} de {sheet.totalRows} filas
        {grid.encoding && ` · codificación ${grid.encoding}`}
        {grid.delimiter &&
          ` · separador “${grid.delimiter === '\t' ? 'tabulador' : grid.delimiter}”`}
        .
      </p>
    </div>
  );
}
