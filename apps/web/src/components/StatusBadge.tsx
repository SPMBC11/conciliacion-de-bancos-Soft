import {
  AlertTriangle,
  Ban,
  CheckCheck,
  CheckCircle2,
  Mail,
  UserCheck,
  UserX,
  CircleDashed,
  Clock,
  Copy,
  FileWarning,
  GitCompare,
  HelpCircle,
  Loader2,
  Lock,
  type LucideIcon,
  Scale,
  ShieldCheck,
  Sparkles,
  XCircle,
} from 'lucide-react';
import { cn } from '@/lib/utils';

type Tone = 'neutral' | 'info' | 'success' | 'warning' | 'danger';

/**
 * Estados semánticos (secciones 13 y 20). Cada estado lleva texto + icono:
 * nunca se comunica solo con color.
 */
export const STATUSES = {
  // Conciliaciones / procesos
  PENDING: { label: 'Pendiente', icon: Clock, tone: 'neutral' },
  PROCESSING: { label: 'En procesamiento', icon: Loader2, tone: 'info' },
  PROPOSED: { label: 'Coincidencia propuesta', icon: Sparkles, tone: 'info' },
  AMBIGUOUS: { label: 'Ambigua', icon: HelpCircle, tone: 'warning' },
  RECONCILED: { label: 'Conciliada', icon: CheckCircle2, tone: 'success' },
  WITH_DIFFERENCES: { label: 'Con diferencias', icon: Scale, tone: 'danger' },
  NEEDS_REVIEW: { label: 'Requiere revisión', icon: AlertTriangle, tone: 'warning' },
  REJECTED: { label: 'Rechazada', icon: XCircle, tone: 'danger' },
  IMPORT_ERROR: { label: 'Error de importación', icon: FileWarning, tone: 'danger' },
  APPROVED: { label: 'Aprobada', icon: ShieldCheck, tone: 'success' },
  CLOSED: { label: 'Cerrada', icon: Lock, tone: 'neutral' },
  // Movimientos en la mesa de trabajo
  AUTO_MATCHED: { label: 'Conciliado automático', icon: CheckCheck, tone: 'success' },
  SUGGESTED: { label: 'Sugerido', icon: Sparkles, tone: 'info' },
  MANUAL_MATCHED: { label: 'Conciliado manual', icon: CheckCircle2, tone: 'success' },
  RECONCILING_ITEM: { label: 'Partida conciliatoria', icon: GitCompare, tone: 'warning' },
  ADJUSTMENT_PROPOSED: { label: 'Ajuste propuesto', icon: CircleDashed, tone: 'info' },
  POSSIBLE_DUPLICATE: { label: 'Posible duplicado', icon: Copy, tone: 'warning' },
  DISCARDED: { label: 'Descartado', icon: Ban, tone: 'neutral' },
  // Usuarios
  USER_ACTIVE: { label: 'Activo', icon: UserCheck, tone: 'success' },
  USER_DISABLED: { label: 'Desactivado', icon: UserX, tone: 'neutral' },
  INVITED: { label: 'Invitación pendiente', icon: Mail, tone: 'info' },
} satisfies Record<string, { label: string; icon: LucideIcon; tone: Tone }>;

export type StatusKey = keyof typeof STATUSES;

const TONES: Record<Tone, string> = {
  neutral: 'bg-surface-secondary text-muted-foreground',
  info: 'bg-primary/10 text-primary dark:text-primary-hover',
  success: 'bg-success/12 text-success-text',
  warning: 'bg-warning/15 text-warning-text',
  danger: 'bg-danger/12 text-danger-text',
};

export function StatusBadge({ status, className }: { status: StatusKey; className?: string }) {
  const { label, icon: Icon, tone } = STATUSES[status];
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium whitespace-nowrap',
        TONES[tone],
        className,
      )}
    >
      <Icon aria-hidden className={cn('size-3.5', status === 'PROCESSING' && 'animate-spin')} />
      {label}
    </span>
  );
}
