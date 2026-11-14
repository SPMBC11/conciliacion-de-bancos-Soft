import { AlertTriangle, CheckCircle2, XCircle } from 'lucide-react';
import { MoneyCell } from '@/components/MoneyCell';
import { StatusBadge } from '@/components/StatusBadge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { type Currency, formatDate, formatMoney } from '@/lib/format';
import { cn } from '@/lib/utils';
import type { Preview } from './api';

function Stat({
  label,
  value,
  tone,
}: {
  label: string;
  value: number;
  tone?: 'danger' | 'warning';
}) {
  return (
    <div className="rounded-lg border border-border p-3">
      <p className="text-xs text-muted-foreground">{label}</p>
      <p
        className={cn(
          'text-xl font-semibold tabular',
          tone === 'danger' && value > 0 && 'text-danger-text',
          tone === 'warning' && value > 0 && 'text-warning-text',
        )}
      >
        {value.toLocaleString('es-CO')}
      </p>
    </div>
  );
}

/** Resultado de la lectura: conteos, ecuación de saldos, advertencias, errores y muestra. */
export function ImportPreview({ preview, currency }: { preview: Preview; currency: Currency }) {
  const b = preview.balance;
  const m = (v: string | null) => (v === null ? '—' : formatMoney(v, currency));
  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-5">
        <Stat label="Filas leídas" value={preview.rowCount} />
        <Stat label="Movimientos válidos" value={preview.validCount} />
        <Stat label="Con error" value={preview.errorCount} tone="danger" />
        <Stat label="Omitidas" value={preview.skippedCount} />
        <Stat label="Posibles duplicados" value={preview.duplicateCount} tone="warning" />
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Validación de saldos</CardTitle>
          {b.from && (
            <span className="text-xs text-muted-foreground tabular">
              {formatDate(b.from)} – {formatDate(b.to!)}
              {b.reversed && ' · archivo en orden descendente'}
            </span>
          )}
        </CardHeader>
        <CardContent>
          <dl className="grid max-w-md grid-cols-[1fr_auto] gap-x-6 gap-y-1 text-sm tabular">
            <dt>Saldo inicial</dt>
            <dd className="text-right">{m(b.opening)}</dd>
            <dt>(+) Entradas</dt>
            <dd className="text-right">{m(b.inflows)}</dd>
            <dt>(−) Salidas</dt>
            <dd className="text-right">{m(b.outflows)}</dd>
            <dt className="border-t border-border pt-1 font-medium">Saldo final</dt>
            <dd className="border-t border-border pt-1 text-right font-medium">{m(b.closing)}</dd>
            <dt>Diferencia</dt>
            <dd
              className={cn(
                'flex items-center justify-end gap-1 text-right font-semibold',
                b.balanced === true && 'text-success-text',
                b.balanced === false && 'text-danger-text',
              )}
            >
              {b.balanced === true && <CheckCircle2 aria-hidden className="size-4" />}
              {b.balanced === false && <XCircle aria-hidden className="size-4" />}
              {b.difference === null
                ? 'Sin saldos'
                : `${m(b.difference)} ${b.balanced ? '· cuadra' : '· no cuadra'}`}
            </dd>
          </dl>
        </CardContent>
      </Card>

      {preview.warnings.length > 0 && (
        <ul className="space-y-2">
          {preview.warnings.map((w) => (
            <li
              key={w.code}
              role={w.blocking ? 'alert' : undefined}
              className={cn(
                'flex items-start gap-2 rounded-lg px-3 py-2 text-sm',
                w.blocking ? 'bg-danger/10 text-danger-text' : 'bg-warning/12 text-warning-text',
              )}
            >
              <AlertTriangle aria-hidden className="mt-0.5 size-4 shrink-0" />
              {w.message}
            </li>
          ))}
        </ul>
      )}

      {preview.errors.length > 0 && (
        <details className="rounded-lg border border-border p-3 text-sm">
          <summary className="cursor-pointer font-medium text-danger-text">
            Filas con error ({preview.errorCount})
          </summary>
          <ul className="mt-2 max-h-48 space-y-0.5 overflow-auto text-xs">
            {preview.errors.map((e) => (
              <li key={e.row}>
                Fila {e.row}: {e.messages.join(' ')}
              </li>
            ))}
          </ul>
        </details>
      )}

      <div className="overflow-x-auto rounded-xl border border-border bg-surface">
        <table className="w-full text-sm">
          <caption className="p-3 text-left text-sm font-semibold">
            Muestra (primeras {preview.sample.length} filas)
          </caption>
          <thead className="bg-surface-secondary/60 text-left text-xs text-muted-foreground">
            <tr>
              <th className="px-3 py-2 text-right">Fila</th>
              <th className="px-3 py-2">Fecha</th>
              <th className="px-3 py-2">Descripción</th>
              <th className="px-3 py-2">Referencia</th>
              <th className="px-3 py-2 text-right">Importe</th>
              <th className="px-3 py-2">Estado</th>
            </tr>
          </thead>
          <tbody>
            {preview.sample.map((s) => (
              <tr key={s.row} className="border-t border-border">
                <td className="px-3 py-1.5 text-right tabular text-muted-foreground">{s.row}</td>
                <td className="px-3 py-1.5 tabular">
                  {s.tx ? formatDate(s.tx.operationDate) : '—'}
                </td>
                <td
                  className="max-w-80 truncate px-3 py-1.5"
                  title={s.tx?.descriptionOriginal ?? s.errors.join(' ')}
                >
                  {s.tx?.descriptionOriginal ?? (
                    <span className="text-danger-text">{s.errors.join(' ')}</span>
                  )}
                </td>
                <td className="px-3 py-1.5">{s.tx?.reference ?? s.tx?.documentNumber ?? ''}</td>
                <td className="px-3 py-1.5">
                  {s.tx && <MoneyCell amount={s.tx.amount} currency={currency} />}
                </td>
                <td className="px-3 py-1.5">
                  {s.status === 'ERROR' ? (
                    <StatusBadge status="IMPORT_ERROR" />
                  ) : s.status === 'SKIPPED' ? (
                    <StatusBadge status="DISCARDED" />
                  ) : s.duplicate ? (
                    <StatusBadge status="POSSIBLE_DUPLICATE" />
                  ) : (
                    <StatusBadge status="PENDING" />
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
