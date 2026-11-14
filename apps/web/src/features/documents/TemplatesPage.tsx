import { SIDE_LABEL } from '@finagent/contracts';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import type { ColumnDef } from '@tanstack/react-table';
import { toast } from 'sonner';
import { useAuth } from '@/auth/auth-provider';
import { DataTable } from '@/components/DataTable';
import { PageHeader } from '@/components/PageHeader';
import { StatusBadge } from '@/components/StatusBadge';
import { Button } from '@/components/ui/button';
import { useOrgKey } from '@/features/admin/api';
import { api, errorMessage } from '@/lib/api';
import { formatDateTime } from '@/lib/datetime';
import { type Template, useTemplates } from './api';

export function TemplatesPage() {
  const { can } = useAuth();
  const templates = useTemplates();
  const queryClient = useQueryClient();
  const key = useOrgKey('templates');
  const toggle = useMutation({
    mutationFn: (t: Template) =>
      api(`/api/import-templates/${t.id}`, {
        method: 'PATCH',
        body: { status: t.status === 'ACTIVE' ? 'INACTIVE' : 'ACTIVE' },
      }),
    onSuccess: () => {
      toast.success('Plantilla actualizada');
      queryClient.invalidateQueries({ queryKey: key.slice(0, 2) });
    },
    onError: (err) => toast.error(errorMessage(err)),
  });
  const columns: ColumnDef<Template, unknown>[] = [
    { accessorKey: 'name', header: 'Nombre' },
    { id: 'side', accessorFn: (t) => SIDE_LABEL[t.side], header: 'Tipo' },
    {
      id: 'source',
      accessorFn: (t) => t.bank?.name ?? t.software ?? '—',
      header: 'Banco / software',
    },
    { accessorKey: 'format', header: 'Formato' },
    {
      accessorKey: 'currentVersion',
      header: 'Versión',
      cell: ({ getValue }) => `v${getValue() as number}`,
    },
    {
      id: 'auto',
      header: 'Reconocimiento automático',
      enableSorting: false,
      cell: ({ row }) => (row.original.headerSignature ? 'Sí (por encabezado)' : 'No'),
    },
    {
      accessorKey: 'updatedAt',
      header: 'Actualizada',
      cell: ({ getValue }) => (
        <span className="tabular">{formatDateTime(getValue() as string)}</span>
      ),
    },
    {
      accessorKey: 'status',
      header: 'Estado',
      cell: ({ getValue }) => (
        <StatusBadge status={getValue() === 'ACTIVE' ? 'USER_ACTIVE' : 'USER_DISABLED'} />
      ),
    },
    ...(can('documents.import')
      ? [
          {
            id: 'actions',
            header: '',
            enableSorting: false,
            cell: ({ row }) => (
              <Button variant="ghost" size="sm" onClick={() => toggle.mutate(row.original)}>
                {row.original.status === 'ACTIVE' ? 'Desactivar' : 'Activar'}
              </Button>
            ),
          } satisfies ColumnDef<Template, unknown>,
        ]
      : []),
  ];
  return (
    <div className="space-y-6">
      <PageHeader
        title="Plantillas de importación"
        description="Cómo leer los archivos de cada banco y del software contable. Se crean al mapear un archivo real y se reconocen solas en las siguientes cargas. Cada cambio crea una versión nueva."
      />
      <DataTable
        caption="Plantillas"
        columns={columns}
        data={templates.data ?? []}
        isLoading={templates.isPending}
        error={templates.isError ? errorMessage(templates.error) : null}
        onRetry={() => templates.refetch()}
        empty={{
          title: 'Sin plantillas',
          description: 'Suba un archivo y mapee sus columnas: la plantilla se guarda desde ahí.',
        }}
      />
    </div>
  );
}
