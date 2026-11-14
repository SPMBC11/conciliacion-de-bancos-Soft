import { parseAmount } from '@finagent/domain';
import type { ColumnDef } from '@tanstack/react-table';
import { useState } from 'react';
import { toast } from 'sonner';
import { DataTable } from '@/components/DataTable';
import { ConfirmationDialog } from '@/components/ConfirmationDialog';
import { MoneyCell } from '@/components/MoneyCell';
import { PageHeader } from '@/components/PageHeader';
import { EmptyState, ErrorState, LoadingState } from '@/components/States';
import { STATUSES, type StatusKey, StatusBadge } from '@/components/StatusBadge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Dialog, DialogContent, DialogTrigger } from '@/components/ui/dialog';
import { Input, NativeSelect } from '@/components/ui/input';
import { formatDate } from '@/lib/format';
import { SystemStatus } from './SystemStatus';

/** Solo desarrollo: galería para revisar tokens y componentes en claro/oscuro. Datos 100 % ficticios. */
const TOKENS = [
  'background',
  'surface',
  'surface-secondary',
  'foreground',
  'muted-foreground',
  'border',
  'primary',
  'primary-hover',
  'success',
  'warning',
  'danger',
];

type SampleRow = {
  date: string;
  description: string;
  reference: string;
  amount: string;
  status: StatusKey;
};

const SAMPLE: SampleRow[] = [
  {
    date: '2026-10-01',
    description: 'EJEMPLO CONSIGNACION CLIENTE DEMO',
    reference: 'RC-0001',
    amount: '1500000.00',
    status: 'AUTO_MATCHED',
  },
  {
    date: '2026-10-02',
    description: 'EJEMPLO GMF 4X1000',
    reference: '',
    amount: '-6000.00',
    status: 'RECONCILING_ITEM',
  },
  {
    date: '2026-10-03',
    description: 'EJEMPLO COMISION TRANSFERENCIA',
    reference: 'ND-10',
    amount: '-8500.00',
    status: 'SUGGESTED',
  },
  {
    date: '2026-10-03',
    description: 'EJEMPLO PAGO PROVEEDOR DEMO',
    reference: 'CE-0042',
    amount: '-2350000.50',
    status: 'AMBIGUOUS',
  },
  {
    date: '2026-10-04',
    description: 'EJEMPLO INTERESES AHORRO',
    reference: '',
    amount: '12345.67',
    status: 'PENDING',
  },
  {
    date: '2026-10-04',
    description: 'EJEMPLO GMF 4X1000',
    reference: '',
    amount: '-6000.00',
    status: 'POSSIBLE_DUPLICATE',
  },
];

const COLUMNS: ColumnDef<SampleRow, unknown>[] = [
  {
    accessorKey: 'date',
    header: 'Fecha',
    cell: (c) => <span className="tabular">{formatDate(c.getValue() as string)}</span>,
  },
  { accessorKey: 'description', header: 'Descripción' },
  { accessorKey: 'reference', header: 'Referencia' },
  {
    accessorKey: 'amount',
    header: 'Importe',
    meta: { align: 'right' },
    // Orden exacto por centavos (nunca por Number).
    sortingFn: (a, b) => {
      const x = parseAmount(a.original.amount);
      const y = parseAmount(b.original.amount);
      return x < y ? -1 : x > y ? 1 : 0;
    },
    cell: (c) => <MoneyCell amount={c.getValue() as string} />,
  },
  {
    accessorKey: 'status',
    header: 'Estado',
    cell: (c) => <StatusBadge status={c.getValue() as StatusKey} />,
  },
];

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>{title}</CardTitle>
      </CardHeader>
      <CardContent>{children}</CardContent>
    </Card>
  );
}

export function DesignSystemPage() {
  const [confirmOpen, setConfirmOpen] = useState(false);

  return (
    <div className="space-y-6">
      <PageHeader
        title="Design system"
        description="Galería de desarrollo. Datos ficticios. No aparece en producción."
      />

      <div className="grid gap-4 lg:grid-cols-2">
        <Section title="Estado del sistema">
          <SystemStatus />
        </Section>

        <Section title="Tokens de color">
          <ul className="grid grid-cols-2 gap-2 sm:grid-cols-3">
            {TOKENS.map((t) => (
              <li key={t} className="flex items-center gap-2 text-xs">
                <span
                  className="size-6 shrink-0 rounded-md border border-border"
                  style={{ background: `var(--${t})` }}
                />
                <code>{t}</code>
              </li>
            ))}
          </ul>
        </Section>

        <Section title="Botones y campos">
          <div className="flex flex-wrap gap-2">
            <Button>Conciliar</Button>
            <Button variant="secondary">Exportar</Button>
            <Button variant="ghost">Cancelar</Button>
            <Button variant="danger">Deshacer</Button>
            <Button disabled>Deshabilitado</Button>
          </div>
          <div className="mt-4 grid gap-2 sm:grid-cols-2">
            <Input aria-label="Campo de ejemplo" placeholder="Referencia o descripción" />
            <NativeSelect aria-label="Selector de ejemplo" defaultValue="COP">
              <option>COP</option>
              <option>USD</option>
            </NativeSelect>
          </div>
        </Section>

        <Section title="Importes (MoneyCell)">
          <div className="ml-auto max-w-xs space-y-1">
            <MoneyCell amount="1234567.89" />
            <MoneyCell amount="-4000.00" />
            <MoneyCell amount="0.00" />
            <MoneyCell amount="-15250.75" currency="USD" />
          </div>
        </Section>

        <Section title="Estados">
          <div className="flex flex-wrap gap-2">
            {(Object.keys(STATUSES) as StatusKey[]).map((s) => (
              <StatusBadge key={s} status={s} />
            ))}
          </div>
        </Section>

        <Section title="Modales y notificaciones">
          <div className="flex flex-wrap gap-2">
            <Dialog>
              <DialogTrigger asChild>
                <Button variant="secondary">Abrir modal</Button>
              </DialogTrigger>
              <DialogContent
                title="Detalle de coincidencia"
                description="Por qué se relacionaron estos movimientos."
              >
                <p className="text-sm">
                  Regla 1 — Exacta: mismo importe, misma moneda y misma referencia.
                </p>
              </DialogContent>
            </Dialog>
            <Button variant="danger" onClick={() => setConfirmOpen(true)}>
              Deshacer conciliación
            </Button>
            <Button variant="secondary" onClick={() => toast.success('Conciliación guardada')}>
              Toast éxito
            </Button>
            <Button variant="secondary" onClick={() => toast.error('La diferencia no es $ 0,00')}>
              Toast error
            </Button>
          </div>
          <ConfirmationDialog
            open={confirmOpen}
            onOpenChange={setConfirmOpen}
            title="¿Deshacer esta conciliación?"
            description="Los movimientos volverán a quedar pendientes."
            confirmLabel="Deshacer"
            tone="danger"
            requireReason
            onConfirm={(reason) => toast(`Deshecha. Motivo: ${reason}`)}
          />
        </Section>
      </div>

      <div className="space-y-2">
        <h2 className="text-sm font-semibold">Tabla de datos (ejemplo)</h2>
        <DataTable
          caption="Movimientos de ejemplo"
          columns={COLUMNS}
          data={SAMPLE}
          selectable
          pageSize={4}
        />
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        <Section title="Vacío">
          <EmptyState title="No hay movimientos" description="Importe un extracto para comenzar." />
        </Section>
        <Section title="Cargando">
          <LoadingState />
        </Section>
        <Section title="Error">
          <ErrorState message="Tiempo de espera agotado." onRetry={() => toast('Reintentando…')} />
        </Section>
      </div>
    </div>
  );
}
