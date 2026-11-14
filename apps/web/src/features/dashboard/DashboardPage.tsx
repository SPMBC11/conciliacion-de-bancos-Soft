import type { ColumnDef } from '@tanstack/react-table';
import {
  Activity,
  AlertTriangle,
  BarChart3,
  CheckCircle2,
  Clock,
  Hourglass,
  Layers,
  PieChart,
  Receipt,
  Sparkles,
  Wallet,
} from 'lucide-react';
import { usePeriod } from '@/app/period';
import { DataTable } from '@/components/DataTable';
import { PageHeader } from '@/components/PageHeader';
import { StatCard } from '@/components/StatCard';
import { EmptyState } from '@/components/States';
import type { StatusKey } from '@/components/StatusBadge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { greeting, MONTHS } from '@/lib/format';

/**
 * Fase 2: estructura del panel con estados vacíos.
 * Los valores llegan de consultas reales en la Fase 9; hasta entonces cada indicador es `null` (“Sin datos”).
 */
const INDICATORS = [
  { label: 'Conciliaciones del periodo', icon: Layers },
  { label: 'Aprobadas / cerradas', icon: CheckCircle2 },
  { label: 'Con diferencia ≠ 0', icon: AlertTriangle },
  { label: 'Pendientes / en proceso', icon: Hourglass },
  { label: 'Conciliado automáticamente', icon: Sparkles },
  { label: 'Valor de partidas pendientes', icon: Wallet },
  { label: 'Gasto bancario (comisiones + GMF + IVA)', icon: Receipt },
] as const;

const CHARTS = [
  { title: 'Estado de conciliaciones por cuenta', icon: PieChart },
  { title: 'Movimientos procesados por periodo', icon: BarChart3 },
  {
    title: 'Antigüedad de partidas pendientes',
    icon: Clock,
    hint: '0–30, 31–60, 61–90 y más de 90 días',
  },
  { title: 'Gasto bancario mensual por tipo', icon: Receipt },
] as const;

type RecentReconciliation = {
  bank: string;
  account: string;
  period: string;
  status: StatusKey;
  difference: string;
  owner: string;
};

const RECENT_COLUMNS: ColumnDef<RecentReconciliation, unknown>[] = [
  { accessorKey: 'bank', header: 'Banco' },
  { accessorKey: 'account', header: 'Cuenta' },
  { accessorKey: 'period', header: 'Periodo' },
  { accessorKey: 'status', header: 'Estado' },
  { accessorKey: 'difference', header: 'Diferencia', meta: { align: 'right' } },
  { accessorKey: 'owner', header: 'Responsable' },
];

export function DashboardPage() {
  const { period } = usePeriod();
  const periodLabel = `${MONTHS[period.month - 1]} ${period.year}`;

  return (
    <div className="space-y-6">
      <PageHeader title={greeting()} description={`Panel financiero · ${periodLabel}`} />

      <section
        aria-label="Indicadores"
        className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4"
      >
        {INDICATORS.map((i) => (
          <StatCard key={i.label} label={i.label} icon={i.icon} value={null} />
        ))}
      </section>

      <section aria-label="Gráficos" className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        {CHARTS.map((c) => (
          <Card key={c.title}>
            <CardHeader>
              <CardTitle>{c.title}</CardTitle>
            </CardHeader>
            <CardContent>
              <EmptyState
                icon={c.icon}
                title="Aún no hay datos para graficar"
                description={
                  'hint' in c
                    ? `Se mostrará por tramos (${c.hint}) cuando existan partidas pendientes.`
                    : 'Aparecerá cuando existan conciliaciones en el periodo.'
                }
              />
            </CardContent>
          </Card>
        ))}
      </section>

      <section aria-label="Actividad" className="grid grid-cols-1 gap-4 xl:grid-cols-3">
        <Card className="xl:col-span-1">
          <CardHeader>
            <CardTitle>Actividad reciente</CardTitle>
          </CardHeader>
          <CardContent>
            <EmptyState
              icon={Activity}
              title="Sin actividad"
              description="Aquí verá importaciones, conciliaciones y aprobaciones."
            />
          </CardContent>
        </Card>
        <div className="space-y-2 xl:col-span-2">
          <h2 className="text-sm font-semibold">Conciliaciones recientes</h2>
          <DataTable
            caption="Conciliaciones recientes"
            columns={RECENT_COLUMNS}
            data={[]}
            searchPlaceholder="Buscar conciliación…"
            empty={{
              title: 'Todavía no hay conciliaciones',
              description:
                'Cuando cree la primera conciliación aparecerá aquí con su estado y diferencia.',
            }}
          />
        </div>
      </section>
    </div>
  );
}
