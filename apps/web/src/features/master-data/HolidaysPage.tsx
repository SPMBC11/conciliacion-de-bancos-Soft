import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { ColumnDef } from '@tanstack/react-table';
import { Plus, Trash2 } from 'lucide-react';
import { useState } from 'react';
import { toast } from 'sonner';
import { useAuth } from '@/auth/auth-provider';
import { DataTable } from '@/components/DataTable';
import { FormAlert } from '@/components/Form';
import { PageHeader } from '@/components/PageHeader';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent } from '@/components/ui/dialog';
import { Input, NativeSelect } from '@/components/ui/input';
import { useOrgKey } from '@/features/admin/api';
import { api, errorMessage } from '@/lib/api';
import { formatDate } from '@/lib/format';

type HolidayRow = {
  id: string | null;
  date: string;
  name: string;
  source: 'NACIONAL' | 'ORGANIZACION';
};

const WEEKDAYS = ['domingo', 'lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábado'];
const weekday = (iso: string) => WEEKDAYS[new Date(`${iso}T00:00:00Z`).getUTCDay()];

export function HolidaysPage() {
  const { can } = useAuth();
  const canManage = can('master_data.manage');
  const [year, setYear] = useState(new Date().getFullYear());
  const [addOpen, setAddOpen] = useState(false);
  const key = useOrgKey('holidays', year);
  const queryClient = useQueryClient();
  const holidays = useQuery({
    queryKey: key,
    queryFn: () => api<HolidayRow[]>('/api/holidays', { query: { year } }),
  });
  const remove = useMutation({
    mutationFn: (id: string) => api(`/api/holidays/${id}`, { method: 'DELETE' }),
    onSuccess: () => {
      toast.success('Festivo eliminado');
      queryClient.invalidateQueries({ queryKey: key });
    },
    onError: (err) => toast.error(errorMessage(err)),
  });

  const columns: ColumnDef<HolidayRow, unknown>[] = [
    {
      accessorKey: 'date',
      header: 'Fecha',
      cell: ({ getValue }) => <span className="tabular">{formatDate(getValue() as string)}</span>,
    },
    { id: 'weekday', accessorFn: (h) => weekday(h.date), header: 'Día', enableSorting: false },
    { accessorKey: 'name', header: 'Festivo' },
    {
      accessorKey: 'source',
      header: 'Origen',
      cell: ({ getValue }) =>
        getValue() === 'NACIONAL' ? 'Nacional (Ley 51 de 1983)' : 'Organización',
    },
    ...(canManage
      ? [
          {
            id: 'actions',
            header: '',
            enableSorting: false,
            cell: ({ row: { original: h } }) =>
              h.id && (
                <Button
                  variant="ghost"
                  size="icon"
                  aria-label={`Eliminar ${h.name}`}
                  onClick={() => remove.mutate(h.id!)}
                >
                  <Trash2 />
                </Button>
              ),
          } satisfies ColumnDef<HolidayRow, unknown>,
        ]
      : []),
  ];

  return (
    <div className="space-y-6">
      <PageHeader
        title="Festivos"
        description="Se usan para medir tolerancias en días hábiles. Los nacionales se calculan por ley; puede agregar días no hábiles propios."
        actions={
          <>
            <NativeSelect
              aria-label="Año"
              value={year}
              onChange={(e) => setYear(Number(e.target.value))}
            >
              {Array.from({ length: 6 }, (_, i) => new Date().getFullYear() - 3 + i).map((y) => (
                <option key={y} value={y}>
                  {y}
                </option>
              ))}
            </NativeSelect>
            {canManage && (
              <Button onClick={() => setAddOpen(true)}>
                <Plus aria-hidden /> Agregar festivo
              </Button>
            )}
          </>
        }
      />
      <DataTable
        caption={`Festivos ${year}`}
        columns={columns}
        data={holidays.data ?? []}
        isLoading={holidays.isPending}
        error={holidays.isError ? errorMessage(holidays.error) : null}
        onRetry={() => holidays.refetch()}
        pageSize={40}
      />
      {addOpen && <AddHolidayDialog year={year} onClose={() => setAddOpen(false)} />}
    </div>
  );
}

function AddHolidayDialog({ year, onClose }: { year: number; onClose: () => void }) {
  const queryClient = useQueryClient();
  const [date, setDate] = useState('');
  const [name, setName] = useState('');
  const key = useOrgKey('holidays', Number(date.slice(0, 4)) || year);
  const add = useMutation({
    mutationFn: () => api('/api/holidays', { method: 'POST', body: { date, name } }),
    onSuccess: () => {
      toast.success('Festivo agregado');
      queryClient.invalidateQueries({ queryKey: key });
      onClose();
    },
  });
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent title="Agregar festivo de la organización">
        <form
          className="space-y-4"
          onSubmit={(e) => {
            e.preventDefault();
            add.mutate();
          }}
        >
          {add.isError && <FormAlert>{errorMessage(add.error)}</FormAlert>}
          <label className="block space-y-1 text-sm font-medium">
            Fecha
            <Input type="date" value={date} onChange={(e) => setDate(e.target.value)} required />
          </label>
          <label className="block space-y-1 text-sm font-medium">
            Nombre
            <Input value={name} onChange={(e) => setName(e.target.value)} required minLength={3} />
          </label>
          <div className="flex justify-end gap-2">
            <Button type="button" variant="secondary" onClick={onClose}>
              Cancelar
            </Button>
            <Button type="submit" disabled={add.isPending || !date || name.trim().length < 3}>
              Agregar
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
