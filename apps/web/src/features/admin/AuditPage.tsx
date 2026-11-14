import { keepPreviousData, useQuery } from '@tanstack/react-query';
import type { ColumnDef } from '@tanstack/react-table';
import { ChevronLeft, ChevronRight, Eye } from 'lucide-react';
import { useState } from 'react';
import { DataTable } from '@/components/DataTable';
import { PageHeader } from '@/components/PageHeader';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent } from '@/components/ui/dialog';
import { Input, NativeSelect } from '@/components/ui/input';
import { api, errorMessage } from '@/lib/api';
import { formatDateTime } from '@/lib/datetime';
import { useOrgKey } from './api';

type AuditRow = {
  id: string;
  action: string;
  entity: string;
  entityId: string | null;
  before: unknown;
  after: unknown;
  reason: string | null;
  source: string;
  ip: string | null;
  correlationId: string | null;
  createdAt: string;
  actor: { id: string; fullName: string; email: string } | null;
};

export const ACTION_LABELS: Record<string, string> = {
  INVITATION_CREATED: 'Invitación enviada',
  INVITATION_REVOKED: 'Invitación revocada',
  INVITATION_ACCEPTED: 'Invitación aceptada',
  MEMBER_UPDATED: 'Usuario modificado',
  ROLE_CREATED: 'Rol creado',
  ROLE_UPDATED: 'Rol modificado',
  ORGANIZATION_CREATED: 'Organización creada',
  ORGANIZATION_UPDATED: 'Organización modificada',
  BOOTSTRAP_OWNER_INVITED: 'Propietario inicial invitado',
  MEMBER_ACCOUNT_SCOPE_UPDATED: 'Acceso a cuentas modificado',
  BANK_CREATED: 'Banco agregado',
  BANK_ACCOUNT_CREATED: 'Cuenta bancaria creada',
  BANK_ACCOUNT_UPDATED: 'Cuenta bancaria modificada',
  BANK_ACCOUNT_NUMBER_REVEALED: 'Número de cuenta consultado',
  GL_ACCOUNT_CREATED: 'Cuenta contable creada',
  GL_ACCOUNT_UPDATED: 'Cuenta contable modificada',
  PUC_BASE_LOADED: 'PUC base cargado',
  PUC_IMPORTED: 'PUC importado',
  FEE_MAPPING_UPDATED: 'Mapeo de nota modificado',
  FEE_MAPPING_SUGGESTED_APPLIED: 'Mapeo sugerido aplicado',
  HOLIDAY_CREATED: 'Festivo agregado',
  HOLIDAY_DELETED: 'Festivo eliminado',
  PERIOD_OPENED: 'Periodo abierto',
  DOCUMENT_UPLOADED: 'Archivo cargado',
  DOCUMENT_IMPORT_REQUESTED: 'Importación solicitada',
  DOCUMENT_IMPORTED: 'Archivo importado',
  DOCUMENT_IMPORT_FAILED: 'Importación fallida',
  DOCUMENT_DOWNLOADED: 'Original descargado',
  TEMPLATE_CREATED: 'Plantilla creada',
  TEMPLATE_UPDATED: 'Plantilla modificada',
  DUPLICATE_DECIDED: 'Decisión sobre duplicado',
};

export const ENTITY_LABELS: Record<string, string> = {
  invitation: 'Invitación',
  organization_member: 'Miembro',
  organization: 'Organización',
  role: 'Rol',
  user: 'Usuario',
  user_session: 'Sesión',
  bank: 'Banco',
  bank_account: 'Cuenta bancaria',
  gl_account: 'Cuenta contable',
  chart_of_accounts: 'Plan de cuentas',
  fee_mapping: 'Mapeo de notas',
  holiday: 'Festivo',
  accounting_period: 'Periodo',
  document: 'Documento',
  import_template: 'Plantilla de importación',
  bank_transaction: 'Movimiento bancario',
  accounting_transaction: 'Movimiento contable',
};

const SOURCES: Record<string, string> = {
  UI: 'Web',
  API: 'API',
  WORKER: 'Proceso',
  SYSTEM: 'Sistema',
};
const PAGE_SIZE = 50;

export function AuditPage() {
  const [filters, setFilters] = useState({ action: '', from: '', to: '' });
  const [page, setPage] = useState(1);
  const [detail, setDetail] = useState<AuditRow | null>(null);
  const query = useQuery({
    queryKey: useOrgKey('audit', filters, page),
    queryFn: () =>
      api<{ data: AuditRow[]; total: number }>('/api/audit-logs', {
        query: { ...filters, page, pageSize: PAGE_SIZE },
      }),
    placeholderData: keepPreviousData,
  });
  const totalPages = Math.max(1, Math.ceil((query.data?.total ?? 0) / PAGE_SIZE));
  const setFilter = (key: keyof typeof filters, value: string) => {
    setFilters((f) => ({ ...f, [key]: value }));
    setPage(1);
  };

  const columns: ColumnDef<AuditRow, unknown>[] = [
    {
      accessorKey: 'createdAt',
      header: 'Fecha',
      cell: ({ getValue }) => (
        <span className="tabular whitespace-nowrap">{formatDateTime(getValue() as string)}</span>
      ),
    },
    { id: 'actor', accessorFn: (r) => r.actor?.fullName ?? 'Sistema', header: 'Usuario' },
    {
      accessorKey: 'action',
      header: 'Acción',
      cell: ({ getValue }) => ACTION_LABELS[getValue() as string] ?? (getValue() as string),
    },
    {
      accessorKey: 'entity',
      header: 'Entidad',
      cell: ({ getValue }) => ENTITY_LABELS[getValue() as string] ?? (getValue() as string),
    },
    {
      accessorKey: 'source',
      header: 'Origen',
      cell: ({ getValue }) => SOURCES[getValue() as string] ?? (getValue() as string),
    },
    {
      accessorKey: 'ip',
      header: 'IP',
      cell: ({ getValue }) => <span className="tabular">{(getValue() as string) ?? '—'}</span>,
    },
    {
      id: 'detail',
      header: '',
      enableSorting: false,
      cell: ({ row }) => (
        <Button
          variant="ghost"
          size="icon"
          aria-label="Ver detalle"
          onClick={() => setDetail(row.original)}
        >
          <Eye />
        </Button>
      ),
    },
  ];

  return (
    <div className="space-y-6">
      <PageHeader
        title="Auditoría"
        description="Bitácora inmutable de la organización: nadie puede editar ni borrar registros."
      />
      <DataTable
        caption="Registros de auditoría"
        columns={columns}
        data={query.data?.data ?? []}
        isLoading={query.isPending}
        error={query.isError ? errorMessage(query.error) : null}
        onRetry={() => query.refetch()}
        pageSize={PAGE_SIZE}
        searchPlaceholder="Buscar en esta página…"
        empty={{ title: 'Sin registros', description: 'No hay eventos con estos filtros.' }}
        filters={
          <>
            <NativeSelect
              aria-label="Acción"
              value={filters.action}
              onChange={(e) => setFilter('action', e.target.value)}
            >
              <option value="">Todas las acciones</option>
              {Object.entries(ACTION_LABELS).map(([k, v]) => (
                <option key={k} value={k}>
                  {v}
                </option>
              ))}
            </NativeSelect>
            <Input
              type="date"
              aria-label="Desde"
              className="sm:w-40"
              value={filters.from}
              onChange={(e) => setFilter('from', e.target.value)}
            />
            <Input
              type="date"
              aria-label="Hasta"
              className="sm:w-40"
              value={filters.to}
              onChange={(e) => setFilter('to', e.target.value)}
            />
          </>
        }
      />
      <div className="flex items-center justify-end gap-2 text-sm text-muted-foreground">
        <span>
          Página {page} de {totalPages} · {query.data?.total ?? 0} registros
        </span>
        <Button
          variant="ghost"
          size="icon"
          aria-label="Página anterior"
          disabled={page <= 1}
          onClick={() => setPage(page - 1)}
        >
          <ChevronLeft />
        </Button>
        <Button
          variant="ghost"
          size="icon"
          aria-label="Página siguiente"
          disabled={page >= totalPages}
          onClick={() => setPage(page + 1)}
        >
          <ChevronRight />
        </Button>
      </div>

      <Dialog open={!!detail} onOpenChange={(o) => !o && setDetail(null)}>
        {detail && (
          <DialogContent
            title={ACTION_LABELS[detail.action] ?? detail.action}
            description={formatDateTime(detail.createdAt)}
            className="max-w-2xl"
          >
            <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1 text-sm">
              <dt className="text-muted-foreground">Usuario</dt>
              <dd>
                {detail.actor ? `${detail.actor.fullName} (${detail.actor.email})` : 'Sistema'}
              </dd>
              <dt className="text-muted-foreground">Entidad</dt>
              <dd>
                {ENTITY_LABELS[detail.entity] ?? detail.entity}{' '}
                {detail.entityId && <code className="text-xs">{detail.entityId}</code>}
              </dd>
              {detail.reason && (
                <>
                  <dt className="text-muted-foreground">Motivo</dt>
                  <dd>{detail.reason}</dd>
                </>
              )}
              <dt className="text-muted-foreground">Correlación</dt>
              <dd>
                <code className="text-xs">{detail.correlationId}</code>
              </dd>
            </dl>
            <div className="mt-4 grid gap-3 sm:grid-cols-2">
              {(['before', 'after'] as const).map((k) => (
                <div key={k}>
                  <p className="mb-1 text-xs font-semibold text-muted-foreground uppercase">
                    {k === 'before' ? 'Antes' : 'Después'}
                  </p>
                  <pre className="max-h-64 overflow-auto rounded-lg bg-surface-secondary p-2 text-xs">
                    {detail[k] ? JSON.stringify(detail[k], null, 2) : '—'}
                  </pre>
                </div>
              ))}
            </div>
          </DialogContent>
        )}
      </Dialog>
    </div>
  );
}
