import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { ColumnDef } from '@tanstack/react-table';
import { BookOpen, FileUp, Plus, Wand2 } from 'lucide-react';
import { useState } from 'react';
import { toast } from 'sonner';
import { useAuth } from '@/auth/auth-provider';
import { DataTable } from '@/components/DataTable';
import { FormAlert } from '@/components/Form';
import { PageHeader } from '@/components/PageHeader';
import { EmptyState } from '@/components/States';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Dialog, DialogContent } from '@/components/ui/dialog';
import { Input, NativeSelect } from '@/components/ui/input';
import { useOrgKey } from '@/features/admin/api';
import { api, ApiError, errorMessage } from '@/lib/api';
import { cn } from '@/lib/utils';
import { type GlAccount, glLabel, useGlAccounts } from './api';

const LEVELS = { 1: 'Clase', 2: 'Grupo', 3: 'Cuenta', 4: 'Subcuenta', 5: 'Auxiliar' } as Record<
  number,
  string
>;

export function ChartOfAccountsPage() {
  const { can } = useAuth();
  const canManage = can('master_data.manage');
  const accounts = useGlAccounts();
  const queryClient = useQueryClient();
  const key = useOrgKey('chart-of-accounts');
  const [importOpen, setImportOpen] = useState(false);
  const [createOpen, setCreateOpen] = useState(false);

  const loadBase = useMutation({
    mutationFn: () =>
      api<{ created: number }>('/api/chart-of-accounts/load-base', { method: 'POST' }),
    onSuccess: (r) => {
      toast.success(`PUC base cargado: ${r.created} cuentas`);
      queryClient.invalidateQueries({ queryKey: key });
    },
    onError: (err) => toast.error(errorMessage(err)),
  });

  const columns: ColumnDef<GlAccount, unknown>[] = [
    {
      accessorKey: 'code',
      header: 'Código',
      cell: ({ row: { original: g } }) => (
        <span className="tabular" style={{ paddingLeft: `${(g.level - 1) * 12}px` }}>
          {g.code}
        </span>
      ),
    },
    {
      accessorKey: 'name',
      header: 'Nombre',
      cell: ({ row: { original: g } }) => (
        <span className={cn(g.level <= 2 && 'font-semibold')}>{g.name}</span>
      ),
    },
    { accessorKey: 'level', header: 'Nivel', cell: ({ getValue }) => LEVELS[getValue() as number] },
    {
      accessorKey: 'nature',
      header: 'Naturaleza',
      cell: ({ getValue }) => (getValue() === 'DEBITO' ? 'Débito' : 'Crédito'),
    },
    {
      accessorKey: 'acceptsMovement',
      header: 'Movimiento',
      cell: ({ getValue }) => (getValue() ? 'Sí' : 'No'),
    },
    {
      accessorKey: 'status',
      header: 'Estado',
      cell: ({ getValue }) => (getValue() === 'ACTIVE' ? 'Activa' : 'Inactiva'),
    },
  ];

  const empty = accounts.data?.length === 0;

  return (
    <div className="space-y-6">
      <PageHeader
        title="Plan de cuentas (PUC)"
        description="Referencia: Decreto 2650 de 1993. La contabilidad oficial vive en su ERP: aquí se usa para asociar bancos y proponer ajustes."
        actions={
          canManage &&
          !empty && (
            <>
              <Button variant="secondary" onClick={() => setImportOpen(true)}>
                <FileUp aria-hidden /> Importar Excel/CSV
              </Button>
              <Button onClick={() => setCreateOpen(true)}>
                <Plus aria-hidden /> Nueva cuenta
              </Button>
            </>
          )
        }
      />
      {empty ? (
        <EmptyState
          icon={BookOpen}
          title="Aún no hay plan de cuentas"
          description="Importe el PUC de su empresa desde Excel o CSV, o cargue un PUC base de referencia para empezar (el contador debe validarlo)."
          action={
            canManage && (
              <div className="flex flex-wrap justify-center gap-2">
                <Button onClick={() => setImportOpen(true)}>
                  <FileUp aria-hidden /> Importar Excel/CSV
                </Button>
                <Button
                  variant="secondary"
                  disabled={loadBase.isPending}
                  onClick={() => loadBase.mutate()}
                >
                  Cargar PUC base
                </Button>
              </div>
            )
          }
        />
      ) : (
        <DataTable
          caption="Plan de cuentas"
          columns={columns}
          data={accounts.data ?? []}
          isLoading={accounts.isPending}
          error={accounts.isError ? errorMessage(accounts.error) : null}
          onRetry={() => accounts.refetch()}
          pageSize={50}
          searchPlaceholder="Buscar por código o nombre…"
        />
      )}
      {!empty && <FeeMappingsCard />}
      {importOpen && <ImportDialog onClose={() => setImportOpen(false)} />}
      {createOpen && <CreateAccountDialog onClose={() => setCreateOpen(false)} />}
    </div>
  );
}

type ImportSummary = {
  fileName: string;
  totalRows: number;
  toCreate: number;
  toUpdate: number;
  unchanged: number;
  errorCount: number;
  errors: { row: number; message: string }[];
  applied: boolean;
};

function ImportDialog({ onClose }: { onClose: () => void }) {
  const queryClient = useQueryClient();
  const key = useOrgKey('chart-of-accounts');
  const [file, setFile] = useState<File | null>(null);
  const send = (dryRun: boolean) => {
    const form = new FormData();
    form.append('file', file!);
    return api<ImportSummary>('/api/chart-of-accounts/import', {
      method: 'POST',
      body: form,
      query: { dryRun: dryRun ? 'true' : undefined },
    });
  };
  const preview = useMutation({ mutationFn: () => send(true) });
  const apply = useMutation({
    mutationFn: () => send(false),
    onSuccess: (r) => {
      toast.success(`PUC importado: ${r.toCreate} nuevas, ${r.toUpdate} actualizadas`);
      queryClient.invalidateQueries({ queryKey: key });
      onClose();
    },
  });
  const summary = preview.data;
  const applyError = apply.error instanceof ApiError ? apply.error : null;

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent
        title="Importar plan de cuentas"
        description="Columnas: Código, Nombre y opcionalmente Naturaleza (D/C) y Movimiento (S/N). Se crean o actualizan por código; si hay errores no se guarda nada."
        className="max-w-xl"
      >
        <div className="space-y-4">
          <label className="block space-y-1 text-sm font-medium">
            Archivo (XLSX, XLS o CSV · máx. 5 MB)
            <Input
              type="file"
              accept=".xlsx,.xls,.csv,.txt"
              className="h-auto py-1.5"
              onChange={(e) => {
                setFile(e.target.files?.[0] ?? null);
                preview.reset();
                apply.reset();
              }}
            />
          </label>
          {preview.isError && <FormAlert>{errorMessage(preview.error)}</FormAlert>}
          {applyError && <FormAlert>{applyError.message}</FormAlert>}
          {summary && (
            <div className="space-y-2 rounded-lg border border-border p-3 text-sm">
              <p className="font-medium">Vista previa de {summary.fileName}</p>
              <ul className="grid grid-cols-2 gap-1 tabular sm:grid-cols-4">
                <li>Filas: {summary.totalRows}</li>
                <li className="text-success-text">Nuevas: {summary.toCreate}</li>
                <li>Actualizadas: {summary.toUpdate}</li>
                <li className={summary.errorCount ? 'text-danger-text' : ''}>
                  Errores: {summary.errorCount}
                </li>
              </ul>
              {summary.errorCount > 0 && (
                <ul className="max-h-40 list-disc space-y-0.5 overflow-auto pl-5 text-xs text-danger-text">
                  {summary.errors.map((e, i) => (
                    <li key={i}>
                      {e.row > 0 && `Fila ${e.row}: `}
                      {e.message}
                    </li>
                  ))}
                </ul>
              )}
            </div>
          )}
          <div className="flex justify-end gap-2">
            <Button variant="secondary" onClick={onClose}>
              Cancelar
            </Button>
            {!summary ? (
              <Button disabled={!file || preview.isPending} onClick={() => preview.mutate()}>
                Ver vista previa
              </Button>
            ) : (
              <Button
                disabled={summary.errorCount > 0 || summary.totalRows === 0 || apply.isPending}
                onClick={() => apply.mutate()}
              >
                Confirmar importación
              </Button>
            )}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function CreateAccountDialog({ onClose }: { onClose: () => void }) {
  const queryClient = useQueryClient();
  const key = useOrgKey('chart-of-accounts');
  const [code, setCode] = useState('');
  const [name, setName] = useState('');
  const create = useMutation({
    mutationFn: () => api('/api/chart-of-accounts', { method: 'POST', body: { code, name } }),
    onSuccess: () => {
      toast.success('Cuenta creada');
      queryClient.invalidateQueries({ queryKey: key });
      onClose();
    },
  });
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent
        title="Nueva cuenta contable"
        description="La cuenta padre debe existir. La naturaleza se toma de la clase."
      >
        <form
          className="space-y-4"
          onSubmit={(e) => {
            e.preventDefault();
            create.mutate();
          }}
        >
          {create.isError && <FormAlert>{errorMessage(create.error)}</FormAlert>}
          <label className="block space-y-1 text-sm font-medium">
            Código
            <Input
              value={code}
              onChange={(e) => setCode(e.target.value.replace(/\D/g, ''))}
              inputMode="numeric"
              required
              className="tabular"
            />
          </label>
          <label className="block space-y-1 text-sm font-medium">
            Nombre
            <Input value={name} onChange={(e) => setName(e.target.value)} required />
          </label>
          <div className="flex justify-end gap-2">
            <Button type="button" variant="secondary" onClick={onClose}>
              Cancelar
            </Button>
            <Button type="submit" disabled={create.isPending || !code || name.trim().length < 2}>
              Crear
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}

type FeeMapping = {
  feeType: string;
  label: string;
  side: 'DEBITO' | 'CREDITO';
  suggestedCode: string;
  glAccount: { id: string; code: string; name: string } | null;
};

function FeeMappingsCard() {
  const { can } = useAuth();
  const canManage = can('master_data.manage');
  const queryClient = useQueryClient();
  const key = useOrgKey('fee-mappings');
  const mappings = useQuery({
    queryKey: key,
    queryFn: () => api<FeeMapping[]>('/api/fee-mappings'),
  });
  const gl = useGlAccounts();
  const postable = gl.data?.filter((g) => g.acceptsMovement && g.status === 'ACTIVE') ?? [];
  const refresh = () => queryClient.invalidateQueries({ queryKey: key });
  const save = useMutation({
    mutationFn: (body: { feeType: string; glAccountId: string }) =>
      api('/api/fee-mappings', { method: 'PUT', body }),
    onSuccess: () => {
      toast.success('Mapeo actualizado');
      refresh();
    },
    onError: (err) => toast.error(errorMessage(err)),
  });
  const suggested = useMutation({
    mutationFn: () =>
      api<{ applied: number }>('/api/fee-mappings/apply-suggested', { method: 'POST' }),
    onSuccess: (r) => {
      toast.success(
        r.applied
          ? `${r.applied} tipos mapeados con las cuentas sugeridas`
          : 'No había tipos pendientes con cuenta sugerida en su PUC',
      );
      refresh();
    },
  });

  return (
    <Card>
      <CardHeader>
        <div>
          <CardTitle>Mapeo de notas bancarias</CardTitle>
          <p className="mt-1 text-xs text-muted-foreground">
            Cuenta contable de cada tipo de nota para proponer asientos de ajuste. Los sugeridos son
            ejemplos: el contador los valida.
          </p>
        </div>
        {canManage && (
          <Button
            variant="secondary"
            size="sm"
            disabled={suggested.isPending}
            onClick={() => suggested.mutate()}
          >
            <Wand2 aria-hidden /> Aplicar sugeridos
          </Button>
        )}
      </CardHeader>
      <CardContent>
        <ul className="divide-y divide-border">
          {mappings.data?.map((m) => (
            <li key={m.feeType} className="grid gap-2 py-2 sm:grid-cols-[1fr_auto] sm:items-center">
              <div className="text-sm">
                <p className="font-medium">{m.label}</p>
                <p className="text-xs text-muted-foreground">
                  {m.side === 'DEBITO' ? 'Nota débito' : 'Nota crédito'} · sugerida{' '}
                  {m.suggestedCode}
                </p>
              </div>
              <NativeSelect
                aria-label={`Cuenta para ${m.label}`}
                value={m.glAccount?.id ?? ''}
                disabled={!canManage || save.isPending}
                className="sm:w-80"
                onChange={(e) =>
                  e.target.value && save.mutate({ feeType: m.feeType, glAccountId: e.target.value })
                }
              >
                <option value="">Sin asignar</option>
                {postable.map((g) => (
                  <option key={g.id} value={g.id}>
                    {glLabel(g)}
                  </option>
                ))}
              </NativeSelect>
            </li>
          ))}
        </ul>
      </CardContent>
    </Card>
  );
}
