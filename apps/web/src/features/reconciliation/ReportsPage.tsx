import { useQuery } from '@tanstack/react-query';
import { Download, FileSpreadsheet, Printer } from 'lucide-react';
import { useState } from 'react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { NativeSelect } from '@/components/ui/input';
import { useAuth } from '@/auth/auth-provider';
import { useOrgKey } from '@/features/admin/api';
import { api, errorMessage } from '@/lib/api';
import { formatMoney } from '@/lib/format';
import { useMatchingRuns } from './api';

type Report = {
  generatedAt: string;
  run: {
    id: string;
    bankAccount: { name: string; accountLast4: string; currency: string };
    period: { year: number; month: number };
  };
  summary: {
    bank: { movementCount: number; movementNet: string; pendingMovementCount: number };
    book: { movementCount: number; movementNet: string; pendingMovementCount: number };
    movementDifference: string;
  };
  suggestionStats: { status: string; count: number }[];
  bankTransactions: {
    id: string;
    operationDate: string;
    description: string;
    amount: string;
    currency: string;
    matchStatus: string;
  }[];
  accountingTransactions: {
    id: string;
    operationDate: string;
    description: string;
    amount: string;
    currency: string;
    matchStatus: string;
  }[];
  matches: { id: string; explanation: string; amountDifference: string; itemCount: number }[];
  adjustments: {
    entryDate: string;
    description: string;
    code: string;
    account: string;
    debit: string;
    credit: string;
    currency: string;
  }[];
  reconciliation: { status: string; closedAt: string | null } | null;
};

export function ReportsPage() {
  const { membership } = useAuth();
  const runs = useMatchingRuns();
  const [runId, setRunId] = useState('');
  const selectedId = runId || runs.data?.[0]?.id || '';
  const report = useQuery({
    queryKey: useOrgKey('reconciliation-report', selectedId),
    enabled: Boolean(selectedId),
    queryFn: () => api<Report>(`/api/reconciliations/reports/${selectedId}`),
  });
  const download = async (format: 'csv' | 'xlsx') => {
    const response = await fetch(
      `/api/reconciliations/reports/${selectedId}/export?format=${format}`,
      {
        credentials: 'same-origin',
        headers: membership ? { 'x-organization-id': membership.organizationId } : {},
      },
    );
    if (!response.ok) throw new Error('No se pudo descargar el informe.');
    const href = URL.createObjectURL(await response.blob());
    const anchor = document.createElement('a');
    anchor.href = href;
    anchor.download = `conciliacion-${selectedId}.${format}`;
    anchor.click();
    URL.revokeObjectURL(href);
  };
  const money = (value: string) =>
    formatMoney(value, (report.data?.run.bankAccount.currency ?? 'COP') as 'COP' | 'USD');

  return (
    <main className="mx-auto max-w-6xl space-y-6 p-4 sm:p-6 print:max-w-none print:p-0">
      {report.data?.reconciliation?.status !== 'CLOSED' && (
        <div
          aria-hidden
          className="pointer-events-none fixed inset-0 z-10 hidden items-center justify-center print:flex"
        >
          <span className="rotate-[-25deg] text-8xl font-black tracking-widest text-black/10">
            PRELIMINAR
          </span>
        </div>
      )}
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-sm font-medium text-primary">Fase 9 · Informes</p>
          <h1 className="mt-1 text-2xl font-semibold">Informe de conciliación</h1>
          <p className="mt-2 text-sm text-muted-foreground">
            Los informes sin un cierre aprobado se identifican como preliminares.
          </p>
        </div>
        <div className="flex gap-2 print:hidden">
          <Button
            variant="secondary"
            disabled={!selectedId}
            onClick={() =>
              void download('csv').catch((error: unknown) =>
                toast.error(
                  error instanceof Error ? error.message : 'No se pudo descargar el CSV.',
                ),
              )
            }
          >
            <Download aria-hidden /> CSV
          </Button>
          <Button
            variant="secondary"
            disabled={!selectedId}
            onClick={() =>
              void download('xlsx').catch((error: unknown) =>
                toast.error(
                  error instanceof Error ? error.message : 'No se pudo descargar el Excel.',
                ),
              )
            }
          >
            <FileSpreadsheet aria-hidden /> Excel
          </Button>
          <Button onClick={() => window.print()}>
            <Printer aria-hidden /> PDF / Imprimir
          </Button>
        </div>
      </header>
      <div className="print:hidden">
        <NativeSelect
          aria-label="Ejecución"
          value={selectedId}
          onChange={(e) => setRunId(e.target.value)}
        >
          <option value="">Seleccione una ejecución</option>
          {runs.data?.map((run) => (
            <option key={run.id} value={run.id}>
              {run.bankAccount.name} · {run.period.month}/{run.period.year}
            </option>
          ))}
        </NativeSelect>
      </div>
      {report.isError && (
        <p role="alert" className="text-sm text-danger">
          {errorMessage(report.error)}
        </p>
      )}
      {report.data && (
        <div className="space-y-5">
          <div className="flex flex-wrap items-end justify-between gap-3">
            <div>
              <h2 className="text-lg font-semibold">
                {report.data.run.bankAccount.name} · •••• {report.data.run.bankAccount.accountLast4}
              </h2>
              <p className="text-sm text-muted-foreground">
                Periodo {report.data.run.period.month}/{report.data.run.period.year}
              </p>
            </div>
            <span className="rounded bg-amber-100 px-3 py-1 text-xs font-semibold text-amber-900">
              {report.data.reconciliation?.status === 'CLOSED' ? 'CERRADA' : 'PRELIMINAR'}
            </span>
          </div>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            {[
              ['Movimientos banco', String(report.data.summary.bank.movementCount)],
              ['Saldo neto banco', money(report.data.summary.bank.movementNet)],
              ['Saldo neto libros', money(report.data.summary.book.movementNet)],
              ['Diferencia', money(report.data.summary.movementDifference)],
            ].map(([label, value]) => (
              <Card key={label}>
                <CardContent className="p-4">
                  <p className="text-xs text-muted-foreground">{label}</p>
                  <p className="mt-1 text-lg font-semibold tabular">{value}</p>
                </CardContent>
              </Card>
            ))}
          </div>
          <Card>
            <CardHeader>
              <CardTitle>Estado de las partidas</CardTitle>
            </CardHeader>
            <CardContent>
              <p>
                {report.data.summary.bank.pendingMovementCount} pendientes banco ·{' '}
                {report.data.summary.book.pendingMovementCount} pendientes libros ·{' '}
                {report.data.matches.length} coincidencias confirmadas
              </p>
              <p className="mt-2 text-xs text-muted-foreground">
                Generado {new Date(report.data.generatedAt).toLocaleString('es-CO')}
              </p>
            </CardContent>
          </Card>
          <ReportLedger title="Movimientos bancarios" rows={report.data.bankTransactions} />
          <ReportLedger title="Movimientos contables" rows={report.data.accountingTransactions} />
          {report.data.adjustments.length > 0 && (
            <Card>
              <CardHeader>
                <CardTitle>Ajustes aprobados</CardTitle>
              </CardHeader>
              <CardContent className="overflow-x-auto">
                <table className="w-full min-w-[650px] text-sm">
                  <thead>
                    <tr className="border-b border-border text-left">
                      <th className="p-2">Fecha</th>
                      <th className="p-2">Cuenta</th>
                      <th className="p-2">Descripción</th>
                      <th className="p-2 text-right">Débito</th>
                      <th className="p-2 text-right">Crédito</th>
                    </tr>
                  </thead>
                  <tbody>
                    {report.data.adjustments.map((line, i) => (
                      <tr key={`${line.code}-${i}`} className="border-b border-border">
                        <td className="p-2">{line.entryDate}</td>
                        <td className="p-2">
                          {line.code} · {line.account}
                        </td>
                        <td className="p-2">{line.description}</td>
                        <td className="p-2 text-right">
                          {formatMoney(line.debit, line.currency as 'COP' | 'USD')}
                        </td>
                        <td className="p-2 text-right">
                          {formatMoney(line.credit, line.currency as 'COP' | 'USD')}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </CardContent>
            </Card>
          )}
          <Card>
            <CardHeader>
              <CardTitle>Firmas</CardTitle>
            </CardHeader>
            <CardContent className="grid gap-8 pt-8 sm:grid-cols-2">
              <p className="border-t border-border pt-2">Elaboró · Firma y fecha</p>
              <p className="border-t border-border pt-2">Aprobó · Firma y fecha</p>
            </CardContent>
          </Card>
        </div>
      )}
      {!selectedId && !runs.isPending && (
        <p className="py-12 text-center text-sm text-muted-foreground">
          Ejecute una conciliación para generar el informe.
        </p>
      )}
    </main>
  );
}

function ReportLedger({ title, rows }: { title: string; rows: Report['bankTransactions'] }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>
          {title} · {rows.length}
        </CardTitle>
      </CardHeader>
      <CardContent className="overflow-x-auto">
        <table className="w-full min-w-[650px] text-sm">
          <thead>
            <tr className="border-b border-border text-left text-muted-foreground">
              <th className="p-2">Fecha</th>
              <th className="p-2">Descripción</th>
              <th className="p-2 text-right">Importe</th>
              <th className="p-2">Estado</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row.id} className="border-b border-border">
                <td className="p-2 tabular">{row.operationDate}</td>
                <td className="p-2">{row.description}</td>
                <td className="p-2 text-right tabular">
                  {formatMoney(row.amount, row.currency as 'COP' | 'USD')}
                </td>
                <td className="p-2">{row.matchStatus}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </CardContent>
    </Card>
  );
}
