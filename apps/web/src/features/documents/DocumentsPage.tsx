import { SIDE_LABEL, type LedgerSide } from '@finagent/contracts';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { ColumnDef } from '@tanstack/react-table';
import { Upload } from 'lucide-react';
import { useState } from 'react';
import { Link, useNavigate } from 'react-router';
import { usePeriod } from '@/app/period';
import { useAuth } from '@/auth/auth-provider';
import { DataTable } from '@/components/DataTable';
import { FileDropzone } from '@/components/FileDropzone';
import { FormAlert } from '@/components/Form';
import { PageHeader } from '@/components/PageHeader';
import { StatusBadge } from '@/components/StatusBadge';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent } from '@/components/ui/dialog';
import { NativeSelect } from '@/components/ui/input';
import { useOrgKey } from '@/features/admin/api';
import { useBankAccounts } from '@/features/master-data/api';
import { api, errorMessage } from '@/lib/api';
import { formatDateTime } from '@/lib/datetime';
import { MONTHS } from '@/lib/format';
import { type DocumentRow, fileSize, STATUS_BADGE, useDocuments } from './api';

const TITLES: Record<string, { title: string; description: string }> = {
  BANK: { title: 'Extractos bancarios', description: 'Extractos cargados por cuenta y periodo.' },
  BOOK: {
    title: 'Archivos contables',
    description: 'Auxiliares de la cuenta banco exportados del software contable.',
  },
  ALL: {
    title: 'Centro documental',
    description: 'Originales inmutables con su hash SHA-256. Mismo archivo dos veces → se rechaza.',
  },
};

export function DocumentsPage({ side }: { side?: LedgerSide }) {
  const { can } = useAuth();
  const docs = useDocuments({ side });
  const [uploadOpen, setUploadOpen] = useState(false);
  const { title, description } = TITLES[side ?? 'ALL']!;

  const columns: ColumnDef<DocumentRow, unknown>[] = [
    {
      accessorKey: 'fileName',
      header: 'Archivo',
      cell: ({ row: { original: d } }) => (
        <Link
          to={`/documents/${d.id}`}
          className="font-medium text-primary hover:underline dark:text-primary-hover"
        >
          {d.fileName}
        </Link>
      ),
    },
    ...(side
      ? []
      : [
          {
            id: 'side',
            accessorFn: (d: DocumentRow) => SIDE_LABEL[d.side],
            header: 'Tipo',
          } satisfies ColumnDef<DocumentRow, unknown>,
        ]),
    {
      id: 'account',
      accessorFn: (d) =>
        `${d.bankAccount.bank.name} · ${d.bankAccount.name} ****${d.bankAccount.accountLast4}`,
      header: 'Cuenta',
    },
    {
      id: 'period',
      accessorFn: (d) => `${d.period.year}-${String(d.period.month).padStart(2, '0')}`,
      header: 'Periodo',
      cell: ({ row: { original: d } }) => `${MONTHS[d.period.month - 1]} ${d.period.year}`,
    },
    { accessorKey: 'format', header: 'Formato' },
    {
      accessorKey: 'sizeBytes',
      header: 'Tamaño',
      meta: { align: 'right' },
      cell: ({ getValue }) => <span className="tabular">{fileSize(getValue() as number)}</span>,
    },
    {
      id: 'result',
      header: 'Movimientos',
      meta: { align: 'right' },
      enableSorting: false,
      cell: ({ row: { original: d } }) => {
        const i = d.imports[0];
        return i?.status === 'COMPLETED' ? (
          <span className="tabular">
            {i.importedCount.toLocaleString('es-CO')}
            {i.duplicateCount > 0 && (
              <span className="text-warning-text"> · {i.duplicateCount} dup.</span>
            )}
          </span>
        ) : (
          '—'
        );
      },
    },
    {
      accessorKey: 'status',
      header: 'Estado',
      cell: ({ getValue }) => (
        <StatusBadge status={STATUS_BADGE[getValue() as DocumentRow['status']]} />
      ),
    },
    {
      accessorKey: 'createdAt',
      header: 'Cargado',
      cell: ({ getValue }) => (
        <span className="tabular whitespace-nowrap">{formatDateTime(getValue() as string)}</span>
      ),
    },
  ];

  return (
    <div className="space-y-6">
      <PageHeader
        title={title}
        description={description}
        actions={
          can('documents.import') && (
            <Button onClick={() => setUploadOpen(true)}>
              <Upload aria-hidden /> Subir archivo
            </Button>
          )
        }
      />
      <DataTable
        caption={title}
        columns={columns}
        data={docs.data ?? []}
        isLoading={docs.isPending}
        error={docs.isError ? errorMessage(docs.error) : null}
        onRetry={() => docs.refetch()}
        searchPlaceholder="Buscar por archivo o cuenta…"
        empty={{
          title: 'Sin archivos',
          description: 'Suba un extracto bancario o un auxiliar contable para empezar.',
        }}
      />
      {uploadOpen && (
        <UploadDialog defaultSide={side ?? 'BANK'} onClose={() => setUploadOpen(false)} />
      )}
    </div>
  );
}

type UploadResult = {
  document: { id: string };
  suggestedTemplate: { id: string; name: string } | null;
};

function UploadDialog({ defaultSide, onClose }: { defaultSide: LedgerSide; onClose: () => void }) {
  const accounts = useBankAccounts();
  const { period } = usePeriod();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const docsKey = useOrgKey('documents');
  const periods = useQuery({
    queryKey: useOrgKey('periods', period.year),
    queryFn: () =>
      api<{ periods: { month: number }[] }>('/api/periods', { query: { year: period.year } }),
  });
  const [side, setSide] = useState<LedgerSide>(defaultSide);
  const [accountId, setAccountId] = useState('');
  const [month, setMonth] = useState<number | ''>('');
  const [file, setFile] = useState<File | null>(null);
  const open = periods.data?.periods.map((p) => p.month) ?? [];
  const selectedMonth =
    month || (open.includes(period.month) ? period.month : (open[open.length - 1] ?? ''));

  const upload = useMutation({
    mutationFn: () => {
      const form = new FormData();
      form.append('bankAccountId', accountId);
      form.append('side', side);
      form.append('year', String(period.year));
      form.append('month', String(selectedMonth));
      form.append('file', file!);
      return api<UploadResult>('/api/documents/upload', { method: 'POST', body: form });
    },
    onSuccess: (r) => {
      queryClient.invalidateQueries({ queryKey: docsKey.slice(0, 2) });
      navigate(
        `/documents/${r.document.id}${r.suggestedTemplate ? `?template=${r.suggestedTemplate.id}` : ''}`,
      );
    },
  });
  const activeAccounts = accounts.data?.filter((a) => a.status === 'ACTIVE') ?? [];

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent
        title="Subir archivo"
        description="Después verá la vista previa y la validación de saldos antes de importar."
        className="max-w-xl"
      >
        <form
          className="space-y-4"
          onSubmit={(e) => {
            e.preventDefault();
            upload.mutate();
          }}
        >
          {upload.isError && <FormAlert>{errorMessage(upload.error)}</FormAlert>}
          <fieldset className="grid grid-cols-2 gap-2 text-sm">
            <legend className="mb-1 font-medium">Tipo de archivo</legend>
            {(['BANK', 'BOOK'] as const).map((s) => (
              <label
                key={s}
                className="flex cursor-pointer items-center gap-2 rounded-lg border border-border p-3 has-[:checked]:border-primary has-[:checked]:bg-primary/5"
              >
                <input type="radio" name="side" checked={side === s} onChange={() => setSide(s)} />
                {SIDE_LABEL[s]}
              </label>
            ))}
          </fieldset>
          <div className="grid gap-3 sm:grid-cols-2">
            <label className="space-y-1 text-sm font-medium">
              Cuenta bancaria
              <NativeSelect
                aria-label="Cuenta bancaria"
                className="w-full"
                value={accountId}
                onChange={(e) => setAccountId(e.target.value)}
                required
              >
                <option value="">Seleccione…</option>
                {activeAccounts.map((a) => (
                  <option key={a.id} value={a.id}>
                    {a.bank.name} · {a.name} {a.maskedNumber}
                  </option>
                ))}
              </NativeSelect>
            </label>
            <label className="space-y-1 text-sm font-medium">
              Periodo ({period.year})
              <NativeSelect
                aria-label="Periodo"
                className="w-full"
                value={selectedMonth}
                onChange={(e) => setMonth(Number(e.target.value))}
                required
              >
                {open.length === 0 && <option value="">Sin periodos abiertos</option>}
                {open.map((m) => (
                  <option key={m} value={m}>
                    {MONTHS[m - 1]} {period.year}
                  </option>
                ))}
              </NativeSelect>
            </label>
          </div>
          <FileDropzone
            accept=".xlsx,.xls,.csv,.txt,.ofx,.xml"
            maxBytes={20 * 1024 * 1024}
            file={file}
            onFile={setFile}
            hint="XLSX, XLS, CSV/TXT, OFX o XML CAMT.053 · máx. 20 MB · PDF aún no compatible"
          />
          <div className="flex justify-end gap-2">
            <Button type="button" variant="secondary" onClick={onClose}>
              Cancelar
            </Button>
            <Button
              type="submit"
              disabled={!file || !accountId || !selectedMonth || upload.isPending}
            >
              {upload.isPending ? 'Subiendo…' : 'Subir y revisar'}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
