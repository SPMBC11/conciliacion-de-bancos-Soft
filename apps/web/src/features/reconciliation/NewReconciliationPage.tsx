import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ArrowRight, Play } from 'lucide-react';
import { useState } from 'react';
import { useNavigate } from 'react-router';
import { toast } from 'sonner';
import { usePeriod } from '@/app/period';
import { useAuth } from '@/auth/auth-provider';
import { EmptyState, ErrorState, LoadingState } from '@/components/States';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { NativeSelect } from '@/components/ui/input';
import { useOrgKey } from '@/features/admin/api';
import { useBankAccounts } from '@/features/master-data/api';
import { api, errorMessage } from '@/lib/api';
import { MONTHS } from '@/lib/format';

type PeriodsResponse = {
  periods: { id: string; month: number; accounts: { bankAccountId: string }[] }[];
};
type RunResponse = { id: string };

export function NewReconciliationPage() {
  const { can } = useAuth();
  const { period } = usePeriod();
  const accounts = useBankAccounts();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const runsKey = useOrgKey('matching-runs');
  const periodsKey = useOrgKey('periods', period.year);
  const periods = useQuery({
    queryKey: periodsKey,
    queryFn: () => api<PeriodsResponse>('/api/periods', { query: { year: period.year } }),
  });
  const activeAccounts = accounts.data?.filter((a) => a.status === 'ACTIVE') ?? [];
  const [accountId, setAccountId] = useState('');
  const selectedAccount = activeAccounts.find((a) => a.id === accountId) ?? activeAccounts[0];
  const availablePeriods = (periods.data?.periods ?? []).filter((p) =>
    p.accounts.some((a) => a.bankAccountId === selectedAccount?.id),
  );
  const [month, setMonth] = useState<number | ''>('');
  const selectedPeriod =
    availablePeriods.find((p) => p.month === (month || period.month)) ?? availablePeriods.at(-1);

  const create = useMutation({
    mutationFn: () => {
      if (!selectedAccount || !selectedPeriod)
        throw new Error('Seleccione una cuenta y un periodo abierto.');
      return api<RunResponse>('/api/reconciliations/runs', {
        method: 'POST',
        headers: { 'idempotency-key': crypto.randomUUID() },
        body: { bankAccountId: selectedAccount.id, periodId: selectedPeriod.id },
      });
    },
    onSuccess: async (run) => {
      await queryClient.invalidateQueries({ queryKey: runsKey });
      toast.success('Ejecución de conciliación creada');
      navigate(`/reconciliations/center?runId=${run.id}`);
    },
    onError: (error) => toast.error(errorMessage(error)),
  });

  if (accounts.isPending || periods.isPending) return <LoadingState rows={5} />;
  if (accounts.isError)
    return <ErrorState message={errorMessage(accounts.error)} onRetry={() => accounts.refetch()} />;
  if (periods.isError)
    return <ErrorState message={errorMessage(periods.error)} onRetry={() => periods.refetch()} />;
  if (!activeAccounts.length)
    return (
      <EmptyState
        title="Sin cuentas bancarias activas"
        description="Registre una cuenta antes de iniciar una conciliación."
      />
    );
  if (!availablePeriods.length)
    return (
      <EmptyState
        title="Sin periodos abiertos"
        description="Abra un periodo para esta cuenta desde Administración → Periodos."
      />
    );

  return (
    <div className="space-y-6">
      <header>
        <h1 className="text-2xl font-semibold tracking-tight">Nueva conciliación</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Seleccione la cuenta y el periodo. El sistema compara los movimientos importados y explica
          cada propuesta.
        </p>
      </header>
      <Card className="max-w-2xl">
        <CardHeader>
          <CardTitle>Alcance de la ejecución</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <label className="block space-y-1 text-sm font-medium">
            Cuenta bancaria
            <NativeSelect
              aria-label="Cuenta bancaria"
              value={selectedAccount?.id ?? ''}
              onChange={(e) => setAccountId(e.target.value)}
            >
              {activeAccounts.map((account) => (
                <option key={account.id} value={account.id}>
                  {account.bank.name} · {account.name} {account.maskedNumber}
                </option>
              ))}
            </NativeSelect>
          </label>
          <label className="block space-y-1 text-sm font-medium">
            Periodo
            <NativeSelect
              aria-label="Periodo"
              value={selectedPeriod?.month ?? ''}
              onChange={(e) => setMonth(Number(e.target.value))}
            >
              {availablePeriods.map((p) => (
                <option key={p.id} value={p.month}>
                  {MONTHS[p.month - 1]} {period.year}
                </option>
              ))}
            </NativeSelect>
          </label>
          <div className="rounded-lg bg-surface-secondary p-4 text-sm text-muted-foreground">
            La ejecución conserva la versión de reglas y la huella de los movimientos usados. Las
            sugerencias no se confirman automáticamente.
          </div>
          {can('reconciliations.prepare') && (
            <Button
              className="w-full sm:w-auto"
              disabled={create.isPending || !selectedPeriod}
              onClick={() => create.mutate()}
            >
              <Play aria-hidden /> Ejecutar motor <ArrowRight aria-hidden />
            </Button>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
