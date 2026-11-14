import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Save } from 'lucide-react';
import { useEffect, useState } from 'react';
import { toast } from 'sonner';
import { useAuth } from '@/auth/auth-provider';
import { ErrorState, LoadingState } from '@/components/States';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { useOrgKey } from '@/features/admin/api';
import { api, errorMessage } from '@/lib/api';

type Rule = {
  id: string;
  version: number;
  dateToleranceBusinessDays: number;
  amountTolerance: string;
  amountToleranceBasisPoints: number;
  maxGroupSize: number;
  createdAt: string;
};

export function RulesPage() {
  const { can } = useAuth();
  const key = useOrgKey('matching-rules');
  const queryClient = useQueryClient();
  const result = useQuery({
    queryKey: key,
    queryFn: () => api<Rule>('/api/reconciliations/rules'),
  });
  const [dateDays, setDateDays] = useState('3');
  const [amount, setAmount] = useState('1000.00');
  const [basisPoints, setBasisPoints] = useState('10');
  const [groupSize, setGroupSize] = useState('6');
  useEffect(() => {
    if (!result.data) return;
    setDateDays(String(result.data.dateToleranceBusinessDays));
    setAmount(result.data.amountTolerance);
    setBasisPoints(String(result.data.amountToleranceBasisPoints));
    setGroupSize(String(result.data.maxGroupSize));
  }, [result.data]);
  const save = useMutation({
    mutationFn: () =>
      api<Rule>('/api/reconciliations/rules', {
        method: 'PUT',
        body: {
          dateToleranceBusinessDays: Number(dateDays),
          amountTolerance: amount,
          amountToleranceBasisPoints: Number(basisPoints),
          maxGroupSize: Number(groupSize),
        },
      }),
    onSuccess: async () => {
      toast.success('Nueva versión de reglas guardada');
      await queryClient.invalidateQueries({ queryKey: key });
    },
    onError: (error) => toast.error(errorMessage(error)),
  });

  if (result.isPending) return <LoadingState rows={4} />;
  if (result.isError)
    return <ErrorState message={errorMessage(result.error)} onRetry={() => result.refetch()} />;
  return (
    <div className="space-y-6">
      <header>
        <h1 className="text-2xl font-semibold tracking-tight">Reglas de conciliación</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Cada cambio crea una versión nueva; las ejecuciones anteriores conservan sus reglas
          originales.
        </p>
      </header>
      <Card className="max-w-3xl">
        <CardHeader>
          <div>
            <CardTitle>Versión {result.data.version}</CardTitle>
            <p className="mt-1 text-xs text-muted-foreground">
              Los importes se calculan en centavos exactos.
            </p>
          </div>
        </CardHeader>
        <CardContent className="grid gap-4 sm:grid-cols-2">
          <label className="space-y-1 text-sm font-medium">
            Tolerancia de fecha (días hábiles)
            <Input
              type="number"
              min={0}
              max={30}
              value={dateDays}
              onChange={(e) => setDateDays(e.target.value)}
            />
          </label>
          <label className="space-y-1 text-sm font-medium">
            Máxima diferencia de importe
            <Input inputMode="decimal" value={amount} onChange={(e) => setAmount(e.target.value)} />
          </label>
          <label className="space-y-1 text-sm font-medium">
            Límite relativo (puntos base)
            <Input
              type="number"
              min={0}
              max={1000}
              value={basisPoints}
              onChange={(e) => setBasisPoints(e.target.value)}
            />
          </label>
          <label className="space-y-1 text-sm font-medium">
            Máximo de movimientos por grupo
            <Input
              type="number"
              min={2}
              max={8}
              value={groupSize}
              onChange={(e) => setGroupSize(e.target.value)}
            />
          </label>
          <p className="sm:col-span-2 rounded-lg bg-surface-secondary p-3 text-sm text-muted-foreground">
            El motor usa el límite menor entre el valor máximo y el porcentaje configurado. Ninguna
            propuesta se aprueba automáticamente.
          </p>
          {can('rules.manage') && (
            <div className="sm:col-span-2">
              <Button disabled={save.isPending} onClick={() => save.mutate()}>
                <Save aria-hidden /> Guardar nueva versión
              </Button>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
