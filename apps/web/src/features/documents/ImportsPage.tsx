import { SIDE_LABEL, type LedgerSide } from '@finagent/contracts';
import { useQuery } from '@tanstack/react-query';
import type { ColumnDef } from '@tanstack/react-table';
import { Link } from 'react-router';
import { DataTable } from '@/components/DataTable';
import { PageHeader } from '@/components/PageHeader';
import { StatusBadge } from '@/components/StatusBadge';
import { useOrgKey } from '@/features/admin/api';
import { api, errorMessage } from '@/lib/api';
import { formatDateTime } from '@/lib/datetime';
import { MONTHS } from '@/lib/format';
import type { ImportRow } from './api';

type Row = ImportRow & {
  createdAt: string;
  document: {
    id: string;
    fileName: string;
    side: LedgerSide;
    format: string;
    period: { year: number; month: number };
    bankAccount: { name: string; accountLast4: string; bank: { name: string } };
  };
  templateVersion: { version: number; template: { name: string } } | null;
};

const STATUS = {
  QUEUED: 'PENDING',
  PROCESSING: 'PROCESSING',
  COMPLETED: 'IMPORTED',
  FAILED: 'IMPORT_ERROR',
} as const;

export function ImportsPage() {
  const imports = useQuery({
    queryKey: useOrgKey('imports'),
    queryFn: () => api<Row[]>('/api/document-imports'),
    refetchInterval: (q) =>
      q.state.data?.some((i) => i.status === 'QUEUED' || i.status === 'PROCESSING') ? 2000 : false,
  });
  const columns: ColumnDef<Row, unknown>[] = [
    {
      accessorKey: 'createdAt',
      header: 'Fecha',
      cell: ({ getValue }) => (
        <span className="tabular whitespace-nowrap">{formatDateTime(getValue() as string)}</span>
      ),
    },
    {
      id: 'file',
      accessorFn: (r) => r.document.fileName,
      header: 'Archivo',
      cell: ({ row: { original: r } }) => (
        <Link
          to={`/documents/${r.document.id}`}
          className="font-medium text-primary hover:underline dark:text-primary-hover"
        >
          {r.document.fileName}
        </Link>
      ),
    },
    { id: 'side', accessorFn: (r) => SIDE_LABEL[r.document.side], header: 'Tipo' },
    {
      id: 'account',
      accessorFn: (r) =>
        `${r.document.bankAccount.bank.name} · ${r.document.bankAccount.name} ****${r.document.bankAccount.accountLast4}`,
      header: 'Cuenta',
    },
    {
      id: 'period',
      accessorFn: (r) => `${MONTHS[r.document.period.month - 1]} ${r.document.period.year}`,
      header: 'Periodo',
    },
    {
      id: 'template',
      accessorFn: (r) =>
        r.templateVersion
          ? `${r.templateVersion.template.name} v${r.templateVersion.version}`
          : r.document.format,
      header: 'Plantilla',
    },
    {
      accessorKey: 'importedCount',
      header: 'Importados',
      meta: { align: 'right' },
      cell: ({ getValue }) => (
        <span className="tabular">{(getValue() as number).toLocaleString('es-CO')}</span>
      ),
    },
    {
      accessorKey: 'errorCount',
      header: 'Rechazados',
      meta: { align: 'right' },
      cell: ({ getValue }) => <span className="tabular">{getValue() as number}</span>,
    },
    {
      id: 'balanced',
      header: 'Saldos',
      enableSorting: false,
      cell: ({ row: { original: r } }) =>
        r.status !== 'COMPLETED' ? (
          '—'
        ) : r.balanced ? (
          <StatusBadge status="RECONCILED" />
        ) : (
          <StatusBadge status="WITH_DIFFERENCES" />
        ),
    },
    {
      accessorKey: 'status',
      header: 'Estado',
      cell: ({ row: { original: r } }) => (
        <span title={r.failureReason ?? undefined}>
          <StatusBadge status={STATUS[r.status]} />
          {r.status === 'PROCESSING' && (
            <span className="ml-1 text-xs tabular">{r.progress} %</span>
          )}
        </span>
      ),
    },
  ];
  return (
    <div className="space-y-6">
      <PageHeader
        title="Importaciones"
        description="Historial de cargas: quién, cuándo, con qué plantilla, cuántos movimientos y si los saldos cuadraron."
      />
      <DataTable
        caption="Importaciones"
        columns={columns}
        data={imports.data ?? []}
        isLoading={imports.isPending}
        error={imports.isError ? errorMessage(imports.error) : null}
        onRetry={() => imports.refetch()}
        empty={{
          title: 'Sin importaciones',
          description: 'Suba un archivo desde el centro documental.',
        }}
      />
    </div>
  );
}
