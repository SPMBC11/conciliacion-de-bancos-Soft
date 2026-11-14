import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { CalendarPlus } from 'lucide-react';
import { useState } from 'react';
import { toast } from 'sonner';
import { useAuth } from '@/auth/auth-provider';
import { PageHeader } from '@/components/PageHeader';
import { EmptyState, ErrorState, LoadingState } from '@/components/States';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { NativeSelect } from '@/components/ui/input';
import { useOrgKey } from '@/features/admin/api';
import { api, errorMessage } from '@/lib/api';
import { MONTHS } from '@/lib/format';

type PeriodsResponse = {
  year: number;
  accounts: { id: string; name: string; bank: string; maskedNumber: string }[];
  periods: { id: string; month: number; accounts: { bankAccountId: string; status: string }[] }[];
};

const STATUS_LABEL: Record<string, string> = { ABIERTO: 'Abierto' };

function bogotaNow() {
  const [y, m] = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Bogota',
    year: 'numeric',
    month: '2-digit',
  })
    .format(new Date())
    .split('-');
  return { year: Number(y), month: Number(m) };
}

export function PeriodsPage() {
  const { can } = useAuth();
  const now = bogotaNow();
  const [year, setYear] = useState(now.year);
  const key = useOrgKey('periods', year);
  const queryClient = useQueryClient();
  const data = useQuery({
    queryKey: key,
    queryFn: () => api<PeriodsResponse>('/api/periods', { query: { year } }),
  });
  const open = useMutation({
    mutationFn: (month: number) => api('/api/periods', { method: 'POST', body: { year, month } }),
    onSuccess: () => {
      toast.success('Periodo abierto');
      queryClient.invalidateQueries({ queryKey: key });
    },
    onError: (err) => toast.error(errorMessage(err)),
  });

  const opened = new Set(data.data?.periods.map((p) => p.month));
  const lastMonth = year < now.year ? 12 : year === now.year ? now.month : 0;
  const openable = Array.from({ length: lastMonth }, (_, i) => i + 1).filter((m) => !opened.has(m));
  const [toOpen, setToOpen] = useState<number | ''>('');
  const selected =
    toOpen && openable.includes(toOpen) ? toOpen : (openable[openable.length - 1] ?? '');

  return (
    <div className="space-y-6">
      <PageHeader
        title="Periodos contables"
        description="Meses abiertos para conciliar. El estado de cada cuenta (en conciliación, en revisión, aprobado, cerrado) lo determina su conciliación."
        actions={
          <>
            <NativeSelect
              aria-label="Año"
              value={year}
              onChange={(e) => setYear(Number(e.target.value))}
            >
              {Array.from({ length: 5 }, (_, i) => now.year - 3 + i).map((y) => (
                <option key={y} value={y}>
                  {y}
                </option>
              ))}
            </NativeSelect>
            {can('master_data.manage') && openable.length > 0 && (
              <>
                <NativeSelect
                  aria-label="Mes a abrir"
                  value={selected}
                  onChange={(e) => setToOpen(Number(e.target.value))}
                >
                  {openable.map((m) => (
                    <option key={m} value={m}>
                      {MONTHS[m - 1]}
                    </option>
                  ))}
                </NativeSelect>
                <Button
                  disabled={open.isPending || !selected}
                  onClick={() => selected && open.mutate(selected)}
                >
                  <CalendarPlus aria-hidden /> Abrir periodo
                </Button>
              </>
            )}
          </>
        }
      />
      {data.isPending && <LoadingState rows={4} />}
      {data.isError && (
        <ErrorState message={errorMessage(data.error)} onRetry={() => data.refetch()} />
      )}
      {data.data && data.data.periods.length === 0 && (
        <EmptyState
          title={`Sin periodos abiertos en ${year}`}
          description="Abra el primer mes que va a conciliar."
        />
      )}
      {data.data && data.data.periods.length > 0 && (
        <Card className="overflow-x-auto">
          <table className="w-full text-sm">
            <caption className="sr-only">Estado por cuenta bancaria y mes</caption>
            <thead className="bg-surface-secondary/60 text-left text-xs text-muted-foreground">
              <tr>
                <th scope="col" className="px-3 py-2">
                  Mes
                </th>
                {data.data.accounts.map((a) => (
                  <th key={a.id} scope="col" className="px-3 py-2 font-medium whitespace-nowrap">
                    {a.bank} · {a.name} <span className="tabular">{a.maskedNumber}</span>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {data.data.periods.map((p) => (
                <tr key={p.id} className="border-t border-border">
                  <th scope="row" className="px-3 py-2 text-left font-medium">
                    {MONTHS[p.month - 1]} {year}
                  </th>
                  {p.accounts.map((a) => (
                    <td key={a.bankAccountId} className="px-3 py-2 text-muted-foreground">
                      {STATUS_LABEL[a.status] ?? a.status}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
          {data.data.accounts.length === 0 && (
            <p className="p-3 text-sm text-muted-foreground">
              No hay cuentas bancarias activas a las que tenga acceso.
            </p>
          )}
        </Card>
      )}
    </div>
  );
}
