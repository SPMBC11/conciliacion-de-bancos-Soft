import type { LucideIcon } from 'lucide-react';
import type { ReactNode } from 'react';
import { Link } from 'react-router';
import { Card } from '@/components/ui/card';
import { cn } from '@/lib/utils';

type StatCardProps = {
  label: string;
  icon: LucideIcon;
  /** null = aún no hay datos: se muestra “Sin datos”, nunca un número inventado. */
  value: ReactNode | null;
  /** Comparación con el periodo anterior, solo si existen datos reales para ambos periodos. */
  comparison?: ReactNode;
  href?: string;
  className?: string;
};

export function StatCard({ label, icon: Icon, value, comparison, href, className }: StatCardProps) {
  const body = (
    <Card
      className={cn(
        'flex h-full flex-col gap-3 p-5 transition-colors',
        href && 'hover:border-primary/40',
        className,
      )}
    >
      <div className="flex items-start justify-between gap-3">
        <p className="text-sm text-muted-foreground">{label}</p>
        <span className="rounded-lg bg-primary/10 p-2 text-primary dark:text-primary-hover">
          <Icon aria-hidden className="size-4" />
        </span>
      </div>
      {value === null ? (
        <p className="text-lg font-medium text-muted-foreground">Sin datos</p>
      ) : (
        <p className="text-2xl font-semibold tabular">{value}</p>
      )}
      {comparison && <p className="text-xs text-muted-foreground">{comparison}</p>}
    </Card>
  );
  return href ? (
    <Link to={href} className="block rounded-xl">
      {body}
    </Link>
  ) : (
    body
  );
}
