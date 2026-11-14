import { SIDE_LABEL, type TemplateConfigInput } from '@finagent/contracts';
import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Download, FileCheck2, Save } from 'lucide-react';
import { useEffect, useMemo, useRef, useState } from 'react';
import { Link, useParams, useSearchParams } from 'react-router';
import { toast } from 'sonner';
import { useAuth } from '@/auth/auth-provider';
import { FormAlert } from '@/components/Form';
import { MoneyCell } from '@/components/MoneyCell';
import { PageHeader } from '@/components/PageHeader';
import { ErrorState, LoadingState } from '@/components/States';
import { StatusBadge } from '@/components/StatusBadge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input, NativeSelect, Textarea } from '@/components/ui/input';
import { useOrgKey } from '@/features/admin/api';
import { api, errorMessage } from '@/lib/api';
import { formatDateTime } from '@/lib/datetime';
import { type Currency, formatDate, MONTHS, parseLocalAmount } from '@/lib/format';
import {
  type DocumentRow,
  fileSize,
  type Grid,
  type ImportRow,
  type Preview,
  STATUS_BADGE,
  useTemplates,
} from './api';
import { ColumnMapper } from './ColumnMapper';
import { ImportPreview } from './ImportPreview';
import { initialConfig } from './mapping';

type DocumentDetail = Omit<DocumentRow, 'imports'> & { imports: ImportRow[] };

export function DocumentDetailPage() {
  const { id } = useParams<{ id: string }>();
  const key = useOrgKey('document', id);
  const doc = useQuery({
    queryKey: key,
    queryFn: () => api<DocumentDetail>(`/api/documents/${id}`),
    refetchInterval: (q) => (q.state.data?.status === 'IMPORTING' ? 1000 : false),
  });

  if (doc.isPending) return <LoadingState rows={6} />;
  if (doc.isError)
    return <ErrorState message={errorMessage(doc.error)} onRetry={() => doc.refetch()} />;
  const d = doc.data;
  const last = d.imports[0];

  return (
    <div className="space-y-6">
      <PageHeader
        title={d.fileName}
        description={`${SIDE_LABEL[d.side]} · ${d.bankAccount.bank.name} · ${d.bankAccount.name} ****${d.bankAccount.accountLast4} · ${MONTHS[d.period.month - 1]} ${d.period.year}`}
        actions={
          <Button variant="secondary" asChild>
            <a href={`/api/documents/${d.id}/download`}>
              <Download aria-hidden /> Original
            </a>
          </Button>
        }
      />
      <dl className="flex flex-wrap gap-x-6 gap-y-1 text-sm">
        <div>
          <dt className="inline text-muted-foreground">Estado: </dt>
          <dd className="inline">
            <StatusBadge status={STATUS_BADGE[d.status]} />
          </dd>
        </div>
        <div>
          <dt className="inline text-muted-foreground">Formato: </dt>
          <dd className="inline">{d.format}</dd>
        </div>
        <div>
          <dt className="inline text-muted-foreground">Tamaño: </dt>
          <dd className="inline tabular">{fileSize(d.sizeBytes)}</dd>
        </div>
        <div>
          <dt className="inline text-muted-foreground">SHA-256: </dt>
          <dd className="inline font-mono text-xs" title={d.sha256}>
            {d.sha256.slice(0, 16)}…
          </dd>
        </div>
        <div>
          <dt className="inline text-muted-foreground">Cargado: </dt>
          <dd className="inline tabular">{formatDateTime(d.createdAt)}</dd>
        </div>
      </dl>
      {last && last.status !== 'FAILED' ? (
        <ImportResult doc={d} imp={last} />
      ) : (
        <>
          {last?.status === 'FAILED' && (
            <FormAlert>
              La importación anterior falló: {last.failureReason}. Puede intentarlo de nuevo.
            </FormAlert>
          )}
          <ImportWorkflow doc={d} />
        </>
      )}
    </div>
  );
}

function ImportResult({ doc, imp }: { doc: DocumentDetail; imp: ImportRow }) {
  const currency = doc.bankAccount.currency as Currency;
  const running = imp.status === 'QUEUED' || imp.status === 'PROCESSING';
  const txs = useQuery({
    queryKey: useOrgKey('transactions', doc.id),
    queryFn: () =>
      api<{
        data: {
          id: string;
          operationDate: string;
          descriptionOriginal: string;
          reference: string | null;
          documentNumber: string | null;
          amount: string;
          duplicateStatus: string;
        }[];
        total: number;
      }>('/api/transactions', { query: { side: doc.side, documentId: doc.id, pageSize: 200 } }),
    enabled: imp.status === 'COMPLETED',
  });
  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <CardTitle>Importación</CardTitle>
          <StatusBadge status={running ? 'PROCESSING' : 'IMPORTED'} />
        </CardHeader>
        <CardContent className="space-y-3">
          {running ? (
            <div>
              <div
                className="h-2 overflow-hidden rounded-full bg-surface-secondary"
                role="progressbar"
                aria-valuenow={imp.progress ?? 0}
                aria-valuemin={0}
                aria-valuemax={100}
                aria-label="Progreso de la importación"
              >
                <div
                  className="h-full bg-primary transition-all"
                  style={{ width: `${imp.progress ?? 0}%` }}
                />
              </div>
              <p className="mt-1 text-sm text-muted-foreground">
                Procesando en segundo plano… {imp.progress ?? 0} %
              </p>
            </div>
          ) : (
            <dl className="grid grid-cols-2 gap-x-6 gap-y-1 text-sm tabular sm:grid-cols-4">
              <dt className="text-muted-foreground">Importados</dt>
              <dd>{imp.importedCount.toLocaleString('es-CO')}</dd>
              <dt className="text-muted-foreground">Con error</dt>
              <dd>{imp.errorCount}</dd>
              <dt className="text-muted-foreground">Posibles duplicados</dt>
              <dd>{imp.duplicateCount}</dd>
              <dt className="text-muted-foreground">Saldos</dt>
              <dd className={imp.balanced ? 'text-success-text' : 'text-danger-text'}>
                {imp.balanced ? 'Cuadran' : `No cuadran (${imp.balanceDifference})`}
              </dd>
              <dt className="text-muted-foreground">Saldo inicial</dt>
              <dd>
                {imp.openingBalance && (
                  <MoneyCell
                    amount={imp.openingBalance}
                    currency={currency}
                    className="text-left"
                  />
                )}
              </dd>
              <dt className="text-muted-foreground">Saldo final</dt>
              <dd>
                {imp.closingBalance && (
                  <MoneyCell
                    amount={imp.closingBalance}
                    currency={currency}
                    className="text-left"
                  />
                )}
              </dd>
            </dl>
          )}
          {imp.justification && (
            <p className="text-sm">Justificación registrada: “{imp.justification}”</p>
          )}
        </CardContent>
      </Card>
      {txs.data && (
        <div className="overflow-x-auto rounded-xl border border-border bg-surface">
          <table className="w-full text-sm">
            <caption className="p-3 text-left text-sm font-semibold">
              Movimientos importados ({txs.data.total.toLocaleString('es-CO')})
              {txs.data.total > txs.data.data.length && ` · primeros ${txs.data.data.length}`}
            </caption>
            <thead className="bg-surface-secondary/60 text-left text-xs text-muted-foreground">
              <tr>
                <th className="px-3 py-2">Fecha</th>
                <th className="px-3 py-2">Descripción</th>
                <th className="px-3 py-2">Referencia</th>
                <th className="px-3 py-2 text-right">Importe</th>
                <th className="px-3 py-2">Estado</th>
              </tr>
            </thead>
            <tbody>
              {txs.data.data.map((t) => (
                <tr key={t.id} className="border-t border-border">
                  <td className="px-3 py-1.5 tabular">{formatDate(t.operationDate)}</td>
                  <td className="px-3 py-1.5">{t.descriptionOriginal}</td>
                  <td className="px-3 py-1.5">{t.reference ?? t.documentNumber ?? ''}</td>
                  <td className="px-3 py-1.5">
                    <MoneyCell amount={t.amount} currency={currency} />
                  </td>
                  <td className="px-3 py-1.5">
                    <StatusBadge
                      status={t.duplicateStatus === 'POSSIBLE' ? 'POSSIBLE_DUPLICATE' : 'PENDING'}
                    />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

const STRUCTURED = ['OFX', 'CAMT053'];

function ImportWorkflow({ doc }: { doc: DocumentDetail }) {
  const { can } = useAuth();
  const [params] = useSearchParams();
  const queryClient = useQueryClient();
  const docKey = useOrgKey('document', doc.id);
  const currency = doc.bankAccount.currency as Currency;
  const structured = STRUCTURED.includes(doc.format);
  const templates = useTemplates(doc.side);
  const usable = templates.data?.filter((t) => t.status === 'ACTIVE' && t.format !== 'OFX') ?? [];

  const [templateId, setTemplateId] = useState(params.get('template') ?? '');
  const [mapping, setMapping] = useState<TemplateConfigInput | null>(null);
  const [opening, setOpening] = useState('');
  const [closing, setClosing] = useState('');
  const [justification, setJustification] = useState('');
  const idempotencyKey = useRef(crypto.randomUUID());

  const grid = useQuery({
    queryKey: useOrgKey('grid', doc.id),
    queryFn: () => api<Grid>(`/api/documents/${doc.id}/grid`),
    enabled: !structured,
  });
  // Sin plantilla sugerida ni existente: abrir el mapeador con valores adivinados.
  useEffect(() => {
    if (
      !structured &&
      grid.data &&
      !templateId &&
      !mapping &&
      templates.data &&
      usable.length === 0
    ) {
      setMapping(initialConfig(grid.data.sheets[0]!.rows));
    }
  }, [structured, grid.data, templateId, mapping, templates.data, usable.length]);

  const openingApi = opening ? parseLocalAmount(opening) : undefined;
  const closingApi = closing ? parseLocalAmount(closing) : undefined;
  const ready = structured || !!templateId || !!mapping;
  const body = useMemo(
    () => ({
      ...(mapping ? { templateConfig: mapping } : templateId ? { templateId } : {}),
      ...(openingApi && { openingBalance: openingApi }),
      ...(closingApi && { closingBalance: closingApi }),
    }),
    [mapping, templateId, openingApi, closingApi],
  );
  const preview = useQuery({
    queryKey: useOrgKey('preview', doc.id, body),
    queryFn: () => api<Preview>(`/api/documents/${doc.id}/preview`, { method: 'POST', body }),
    enabled: ready && (opening === '' || !!openingApi) && (closing === '' || !!closingApi),
    placeholderData: keepPreviousData,
    retry: false,
  });

  const runImport = useMutation({
    // Idempotency-Key: un doble clic o un reintento no crea dos importaciones.
    mutationFn: () =>
      api('/api/documents/' + doc.id + '/import', {
        method: 'POST',
        headers: { 'idempotency-key': idempotencyKey.current },
        body: {
          ...(templateId && { templateId }),
          ...(openingApi && { openingBalance: openingApi }),
          ...(closingApi && { closingBalance: closingApi }),
          ...(preview.data?.requiresJustification && { justification }),
        },
      }),
    onSuccess: () => {
      toast.success('Importación en curso');
      queryClient.invalidateQueries({ queryKey: docKey });
    },
  });

  const needsBalances = preview.data?.needsBalances || opening !== '' || closing !== '';
  const justificationOk = !preview.data?.requiresJustification || justification.trim().length >= 10;
  const canImport =
    can('documents.import') &&
    !!preview.data?.canImport &&
    !mapping &&
    justificationOk &&
    !runImport.isPending;

  return (
    <div className="space-y-6">
      {!structured && (
        <Card>
          <CardHeader>
            <CardTitle>1. Plantilla de lectura</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="flex flex-col gap-2 sm:flex-row sm:items-end">
              <label className="space-y-1 text-sm font-medium sm:w-96">
                Plantilla
                <NativeSelect
                  aria-label="Plantilla"
                  className="w-full"
                  value={mapping ? '__new' : templateId}
                  onChange={(e) => {
                    if (e.target.value === '__new') {
                      setTemplateId('');
                      setMapping(grid.data ? initialConfig(grid.data.sheets[0]!.rows) : null);
                    } else {
                      setMapping(null);
                      setTemplateId(e.target.value);
                    }
                  }}
                >
                  <option value="">Seleccione…</option>
                  {usable.map((t) => (
                    <option key={t.id} value={t.id}>
                      {t.name} (v{t.currentVersion})
                      {params.get('template') === t.id ? ' · sugerida' : ''}
                    </option>
                  ))}
                  <option value="__new">+ Nueva plantilla (mapear columnas)</option>
                </NativeSelect>
              </label>
              {params.get('template') === templateId && templateId && (
                <p className="text-sm text-success-text">Se reconoció la estructura del archivo.</p>
              )}
            </div>
            {mapping && grid.data && (
              <>
                <ColumnMapper
                  grid={grid.data}
                  side={doc.side}
                  config={mapping}
                  onChange={setMapping}
                />
                <SaveTemplate
                  doc={doc}
                  config={mapping}
                  onSaved={(id) => (setMapping(null), setTemplateId(id))}
                />
              </>
            )}
          </CardContent>
        </Card>
      )}

      {ready && (
        <Card>
          <CardHeader>
            <CardTitle>{structured ? 'Vista previa' : '2. Vista previa y validación'}</CardTitle>
            {preview.isFetching && (
              <span className="text-xs text-muted-foreground">Actualizando…</span>
            )}
          </CardHeader>
          <CardContent className="space-y-4">
            {preview.isError && <FormAlert>{errorMessage(preview.error)}</FormAlert>}
            {needsBalances && (
              <div className="grid gap-3 sm:grid-cols-2">
                <label className="space-y-1 text-sm font-medium">
                  Saldo inicial del periodo
                  <Input
                    inputMode="decimal"
                    className="text-right tabular"
                    placeholder="1.234.567,89"
                    value={opening}
                    onChange={(e) => setOpening(e.target.value)}
                  />
                  {opening && !openingApi && (
                    <span className="text-xs text-danger-text">Formato: 1.234.567,89</span>
                  )}
                </label>
                <label className="space-y-1 text-sm font-medium">
                  Saldo final del periodo
                  <Input
                    inputMode="decimal"
                    className="text-right tabular"
                    placeholder="1.234.567,89"
                    value={closing}
                    onChange={(e) => setClosing(e.target.value)}
                  />
                  {closing && !closingApi && (
                    <span className="text-xs text-danger-text">Formato: 1.234.567,89</span>
                  )}
                </label>
              </div>
            )}
            {preview.data && <ImportPreview preview={preview.data} currency={currency} />}
            {preview.data?.requiresJustification && (
              <label className="block space-y-1 text-sm font-medium">
                Justificación para continuar (queda en auditoría)
                <Textarea
                  value={justification}
                  onChange={(e) => setJustification(e.target.value)}
                  placeholder="Ej. El banco corrigió el saldo en el extracto siguiente."
                />
              </label>
            )}
            {runImport.isError && <FormAlert>{errorMessage(runImport.error)}</FormAlert>}
            {mapping && (
              <p className="text-sm text-muted-foreground">
                Guarde la plantilla para poder importar con ella.
              </p>
            )}
            <div className="flex justify-end">
              <Button disabled={!canImport} onClick={() => runImport.mutate()}>
                <FileCheck2 aria-hidden /> Confirmar importación
              </Button>
            </div>
          </CardContent>
        </Card>
      )}
      {!structured && !ready && !grid.isPending && (
        <p className="text-sm text-muted-foreground">
          Seleccione una plantilla o cree una nueva para ver la vista previa.
        </p>
      )}
      {!structured && grid.isPending && <LoadingState rows={3} label="Leyendo archivo…" />}
      <p className="text-xs text-muted-foreground">
        ¿Necesita ayuda con las plantillas?{' '}
        <Link to="/documents/templates" className="underline">
          Ver plantillas de importación
        </Link>
      </p>
    </div>
  );
}

function SaveTemplate({
  doc,
  config,
  onSaved,
}: {
  doc: DocumentDetail;
  config: TemplateConfigInput;
  onSaved: (id: string) => void;
}) {
  const queryClient = useQueryClient();
  const key = useOrgKey('templates');
  const [name, setName] = useState(
    doc.side === 'BANK' ? `${doc.bankAccount.bank.name} ${doc.format}` : `Auxiliar ${doc.format}`,
  );
  const [software, setSoftware] = useState('');
  const save = useMutation({
    mutationFn: () =>
      api<{ id: string }>('/api/import-templates', {
        method: 'POST',
        body: {
          name,
          side: doc.side,
          format: doc.format,
          config,
          sampleDocumentId: doc.id,
          ...(doc.side === 'BOOK' && software && { software }),
        },
      }),
    onSuccess: (t) => {
      toast.success('Plantilla guardada: se reconocerá automáticamente en próximas cargas');
      queryClient.invalidateQueries({ queryKey: key.slice(0, 2) });
      onSaved(t.id);
    },
  });
  return (
    <div className="flex flex-col gap-2 rounded-lg border border-border p-3 sm:flex-row sm:items-end">
      <label className="flex-1 space-y-1 text-sm font-medium">
        Nombre de la plantilla
        <Input value={name} onChange={(e) => setName(e.target.value)} />
      </label>
      {doc.side === 'BOOK' && (
        <label className="flex-1 space-y-1 text-sm font-medium">
          Software contable
          <Input
            value={software}
            onChange={(e) => setSoftware(e.target.value)}
            placeholder="Siigo, World Office, Alegra…"
          />
        </label>
      )}
      <Button disabled={save.isPending || name.trim().length < 3} onClick={() => save.mutate()}>
        <Save aria-hidden /> Guardar plantilla
      </Button>
      {save.isError && <p className="text-xs text-danger-text">{errorMessage(save.error)}</p>}
    </div>
  );
}
