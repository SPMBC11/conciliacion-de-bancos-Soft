import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Check, FilePlus2, LockKeyhole, Send, Stamp } from 'lucide-react';
import { useState } from 'react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input, NativeSelect } from '@/components/ui/input';
import { useOrgKey } from '@/features/admin/api';
import { api, errorMessage } from '@/lib/api';
import { useMatchingRuns } from './api';

type RecordRow = {
  id: string;
  bankAccountId: string;
  periodId: string;
  status: 'PREPARATION' | 'SUBMITTED' | 'REVIEWED' | 'APPROVED' | 'CLOSED';
  version: number;
  createdAt: string;
  bankAccount: { name: string; accountLast4: string };
  period: { year: number; month: number };
  adjustments: { id: string; status: string }[];
};

type GlAccount = { id: string; code: string; name: string };
const LABEL: Record<RecordRow['status'], string> = {
  PREPARATION: 'En preparación',
  SUBMITTED: 'En revisión',
  REVIEWED: 'Revisada',
  APPROVED: 'Aprobada',
  CLOSED: 'Cerrada',
};
const NEXT: Partial<Record<RecordRow['status'], { action: string; label: string }>> = {
  PREPARATION: { action: 'submit', label: 'Enviar a revisión' },
  SUBMITTED: { action: 'review', label: 'Marcar revisada' },
  REVIEWED: { action: 'approve', label: 'Aprobar' },
  APPROVED: { action: 'close', label: 'Cerrar periodo' },
};

export function ApprovalClosingPage() {
  const client = useQueryClient();
  const recordsKey = useOrgKey('reconciliation-records');
  const [runId, setRunId] = useState('');
  const [description, setDescription] = useState('');
  const [entryDate, setEntryDate] = useState(new Date().toISOString().slice(0, 10));
  const [account1, setAccount1] = useState('');
  const [account2, setAccount2] = useState('');
  const [debit, setDebit] = useState('');
  const [credit, setCredit] = useState('');
  const [reason, setReason] = useState('');
  const runs = useMatchingRuns();
  const records = useQuery({
    queryKey: recordsKey,
    queryFn: () => api<RecordRow[]>('/api/reconciliations/records'),
  });
  const accounts = useQuery({
    queryKey: useOrgKey('chart-of-accounts', 'movement'),
    queryFn: () =>
      api<GlAccount[]>('/api/master-data/chart-of-accounts', { query: { onlyMovement: 'true' } }),
  });
  const refresh = async () => {
    await client.invalidateQueries({ queryKey: recordsKey });
    await client.invalidateQueries({ queryKey: useOrgKey('matching-run-summary') });
  };
  const create = useMutation({
    mutationFn: () => api('/api/reconciliations/records', { method: 'POST', body: { runId } }),
    onSuccess: () => {
      void refresh();
      toast.success('Conciliación preparada.');
    },
    onError: (e) => toast.error(errorMessage(e)),
  });
  const createEntry = useMutation({
    mutationFn: (record: RecordRow) =>
      api('/api/reconciliations/adjustments', {
        method: 'POST',
        body: {
          reconciliationId: record.id,
          entryDate,
          description,
          currency:
            runs.data?.find((run) => run.bankAccountId === record.bankAccountId)?.bankAccount
              .currency ?? 'COP',
          lines: [
            { glAccountId: account1, debit, credit: '0' },
            { glAccountId: account2, debit: '0', credit },
          ],
        },
      }),
    onSuccess: () => {
      void refresh();
      toast.success('Asiento guardado como borrador.');
      setDescription('');
      setDebit('');
      setCredit('');
    },
    onError: (e) => toast.error(errorMessage(e)),
  });
  const transition = useMutation({
    mutationFn: ({ record, action }: { record: RecordRow; action: string }) =>
      api(`/api/reconciliations/records/${record.id}/${action}`, {
        method: 'POST',
        body: { reason },
      }),
    onSuccess: () => {
      void refresh();
      setReason('');
      toast.success('Estado actualizado y auditado.');
    },
    onError: (e) => toast.error(errorMessage(e)),
  });
  const approveEntry = useMutation({
    mutationFn: (id: string) =>
      api(`/api/reconciliations/adjustments/${id}/approve`, { method: 'POST' }),
    onSuccess: () => {
      void refresh();
      toast.success('Asiento aprobado.');
    },
    onError: (e) => toast.error(errorMessage(e)),
  });
  const selectedRun = runs.data?.find((run) => run.id === runId);

  return (
    <div className="mx-auto max-w-6xl space-y-6 p-4 sm:p-6">
      <header>
        <p className="text-sm font-medium text-primary">Fase 8 · Control contable</p>
        <h1 className="mt-1 text-2xl font-semibold">Ajustes, revisión y cierre</h1>
        <p className="mt-2 max-w-3xl text-sm text-muted-foreground">
          Prepare asientos cuadrados, registre revisiones y cierre el periodo con un snapshot
          auditable.
        </p>
      </header>
      <Card>
        <CardHeader>
          <CardTitle>Preparar conciliación</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-3 sm:flex-row">
          <NativeSelect
            aria-label="Ejecución conciliada"
            value={runId}
            onChange={(e) => setRunId(e.target.value)}
          >
            <option value="">Seleccione una ejecución</option>
            {runs.data?.map((run) => (
              <option key={run.id} value={run.id}>
                {run.bankAccount.name} · {run.period.month}/{run.period.year} ·{' '}
                {run.createdAt.slice(0, 10)}
              </option>
            ))}
          </NativeSelect>
          <Button disabled={!runId || create.isPending} onClick={() => create.mutate()}>
            <FilePlus2 aria-hidden /> Preparar
          </Button>
          {selectedRun && (
            <span className="self-center text-sm text-muted-foreground">
              {selectedRun.bankAccount.bank.name} · •••• {selectedRun.bankAccount.accountLast4}
            </span>
          )}
        </CardContent>
      </Card>
      {records.isError && (
        <p role="alert" className="text-sm text-danger">
          {errorMessage(records.error)}
        </p>
      )}
      <div className="space-y-4">
        {records.data?.map((record) => (
          <Card key={record.id}>
            <CardHeader>
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <CardTitle>
                    {record.bankAccount.name} · •••• {record.bankAccount.accountLast4}
                  </CardTitle>
                  <p className="mt-1 text-sm text-muted-foreground">
                    {record.period.month}/{record.period.year} · versión {record.version}
                  </p>
                </div>
                <span className="rounded-full bg-surface-secondary px-3 py-1 text-sm">
                  {LABEL[record.status]}
                </span>
              </div>
            </CardHeader>
            <CardContent className="space-y-4">
              {record.status === 'PREPARATION' && (
                <div className="rounded-lg border border-border p-4">
                  <p className="mb-3 font-medium">Nuevo asiento de ajuste</p>
                  <div className="grid gap-3 sm:grid-cols-2">
                    <Input
                      aria-label="Descripción del asiento"
                      placeholder="Descripción"
                      value={description}
                      onChange={(e) => setDescription(e.target.value)}
                    />
                    <Input
                      aria-label="Fecha del asiento"
                      type="date"
                      value={entryDate}
                      onChange={(e) => setEntryDate(e.target.value)}
                    />
                    <NativeSelect
                      aria-label="Cuenta débito"
                      value={account1}
                      onChange={(e) => setAccount1(e.target.value)}
                    >
                      <option value="">Cuenta del débito</option>
                      {accounts.data?.map((a) => (
                        <option key={a.id} value={a.id}>
                          {a.code} · {a.name}
                        </option>
                      ))}
                    </NativeSelect>
                    <NativeSelect
                      aria-label="Cuenta crédito"
                      value={account2}
                      onChange={(e) => setAccount2(e.target.value)}
                    >
                      <option value="">Cuenta del crédito</option>
                      {accounts.data?.map((a) => (
                        <option key={a.id} value={a.id}>
                          {a.code} · {a.name}
                        </option>
                      ))}
                    </NativeSelect>
                    <Input
                      aria-label="Débito"
                      inputMode="decimal"
                      placeholder="Débito"
                      value={debit}
                      onChange={(e) => setDebit(e.target.value)}
                    />
                    <Input
                      aria-label="Crédito"
                      inputMode="decimal"
                      placeholder="Crédito"
                      value={credit}
                      onChange={(e) => setCredit(e.target.value)}
                    />
                  </div>
                  <Button
                    className="mt-3"
                    disabled={
                      !description ||
                      !account1 ||
                      !account2 ||
                      !debit ||
                      !credit ||
                      createEntry.isPending
                    }
                    onClick={() => createEntry.mutate(record)}
                  >
                    Guardar borrador
                  </Button>
                </div>
              )}
              {record.adjustments.length > 0 && (
                <div className="flex flex-wrap items-center gap-2 text-sm">
                  <span>{record.adjustments.length} asiento(s)</span>
                  {record.adjustments
                    .filter((entry) => entry.status === 'DRAFT')
                    .map((entry) => (
                      <Button
                        key={entry.id}
                        variant="secondary"
                        size="sm"
                        onClick={() => approveEntry.mutate(entry.id)}
                      >
                        <Check aria-hidden /> Aprobar asiento
                      </Button>
                    ))}
                </div>
              )}
              {record.status !== 'CLOSED' && (
                <div className="flex flex-col gap-3 border-t border-border pt-4 sm:flex-row">
                  <Input
                    aria-label="Motivo de la acción"
                    placeholder="Motivo requerido para esta transición"
                    value={reason}
                    onChange={(e) => setReason(e.target.value)}
                  />
                  <Button
                    disabled={reason.trim().length < 3 || transition.isPending}
                    onClick={() =>
                      transition.mutate({ record, action: NEXT[record.status]!.action })
                    }
                  >
                    {record.status === 'PREPARATION' ? (
                      <Send aria-hidden />
                    ) : record.status === 'APPROVED' ? (
                      <LockKeyhole aria-hidden />
                    ) : (
                      <Stamp aria-hidden />
                    )}
                    {NEXT[record.status]?.label}
                  </Button>
                </div>
              )}
              {record.status === 'CLOSED' && (
                <p className="text-sm text-muted-foreground">
                  Snapshot congelado y cierre registrado.
                </p>
              )}
            </CardContent>
          </Card>
        ))}
      </div>
      {!records.isPending && records.data?.length === 0 && (
        <p className="py-8 text-center text-sm text-muted-foreground">
          Aún no hay conciliaciones preparadas para revisión.
        </p>
      )}
    </div>
  );
}
