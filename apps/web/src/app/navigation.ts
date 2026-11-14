import {
  AlertTriangle,
  BarChart3,
  Bell,
  BookOpen,
  Building2,
  CalendarDays,
  CalendarRange,
  Clock,
  Copy,
  FileBarChart,
  FileSpreadsheet,
  FileText,
  FolderOpen,
  GitCompare,
  History,
  Landmark,
  LayoutDashboard,
  ListChecks,
  type LucideIcon,
  Plus,
  Receipt,
  ScrollText,
  Search,
  Settings,
  Shield,
  ShieldCheck,
  SlidersHorizontal,
  Tags,
  Upload,
  Users,
  Workflow,
  Download,
  FileInput,
  Hourglass,
} from 'lucide-react';

export type NavItem = {
  path: string;
  label: string;
  icon: LucideIcon;
  /** Fase en la que la pantalla queda funcional. El menú solo muestra lo ya implementado. */
  phase: number;
};

export type NavGroup = { label: string; items: NavItem[] };

/** Fase actual del proyecto: controla qué rutas aparecen en el menú (no hay enlaces sin funcionalidad). */
export const CURRENT_PHASE = 2;

/** Mapa completo de navegación (sección 6 del master prompt). Única fuente de verdad de rutas. */
export const NAVIGATION: NavGroup[] = [
  {
    label: 'Mi espacio',
    items: [
      { path: '/dashboard', label: 'Panel financiero', icon: LayoutDashboard, phase: 2 },
      { path: '/reconciliations', label: 'Resumen de conciliaciones', icon: ListChecks, phase: 7 },
      { path: '/notifications', label: 'Notificaciones', icon: Bell, phase: 8 },
    ],
  },
  {
    label: 'Conciliación',
    items: [
      { path: '/reconciliations/new', label: 'Nueva conciliación', icon: Plus, phase: 6 },
      {
        path: '/reconciliations/center',
        label: 'Centro de conciliación',
        icon: GitCompare,
        phase: 7,
      },
      { path: '/reconciliations/pending', label: 'Pendientes', icon: Hourglass, phase: 7 },
      {
        path: '/reconciliations/discrepancies',
        label: 'Diferencias',
        icon: AlertTriangle,
        phase: 7,
      },
      { path: '/reconciliations/unmatched', label: 'Sin identificar', icon: Search, phase: 7 },
      { path: '/reconciliations/history', label: 'Historial', icon: History, phase: 8 },
    ],
  },
  {
    label: 'Documentos',
    items: [
      {
        path: '/documents/bank-statements',
        label: 'Extractos bancarios',
        icon: Landmark,
        phase: 5,
      },
      {
        path: '/documents/accounting',
        label: 'Archivos contables',
        icon: FileSpreadsheet,
        phase: 5,
      },
      { path: '/documents/imports', label: 'Importaciones', icon: Upload, phase: 5 },
      {
        path: '/documents/templates',
        label: 'Plantillas de importación',
        icon: FileInput,
        phase: 5,
      },
      { path: '/documents', label: 'Centro documental', icon: FolderOpen, phase: 5 },
    ],
  },
  {
    label: 'Análisis',
    items: [
      { path: '/analysis/matches', label: 'Coincidencias', icon: Workflow, phase: 7 },
      { path: '/analysis/duplicates', label: 'Duplicados', icon: Copy, phase: 7 },
      { path: '/analysis/fees', label: 'Comisiones y GMF', icon: Receipt, phase: 9 },
      { path: '/analysis/aging', label: 'Antigüedad de partidas', icon: Clock, phase: 9 },
    ],
  },
  {
    label: 'Informes',
    items: [
      { path: '/reports', label: 'Reportes financieros', icon: BarChart3, phase: 9 },
      {
        path: '/reports/reconciliation',
        label: 'Informes de conciliación',
        icon: FileBarChart,
        phase: 9,
      },
      { path: '/reports/adjustments', label: 'Asientos de ajuste', icon: FileText, phase: 8 },
      { path: '/reports/exports', label: 'Exportaciones', icon: Download, phase: 9 },
    ],
  },
  {
    label: 'Administración',
    items: [
      {
        path: '/administration/bank-accounts',
        label: 'Cuentas bancarias',
        icon: Building2,
        phase: 4,
      },
      {
        path: '/administration/chart-of-accounts',
        label: 'Plan de cuentas (PUC)',
        icon: BookOpen,
        phase: 4,
      },
      { path: '/administration/periods', label: 'Periodos', icon: CalendarRange, phase: 4 },
      { path: '/administration/users', label: 'Usuarios', icon: Users, phase: 3 },
      { path: '/administration/roles', label: 'Roles y permisos', icon: ShieldCheck, phase: 3 },
      {
        path: '/administration/rules',
        label: 'Reglas de conciliación',
        icon: SlidersHorizontal,
        phase: 6,
      },
      {
        path: '/administration/classification-rules',
        label: 'Reglas de clasificación',
        icon: Tags,
        phase: 6,
      },
      { path: '/administration/holidays', label: 'Festivos', icon: CalendarDays, phase: 4 },
      { path: '/administration/audit', label: 'Auditoría', icon: ScrollText, phase: 3 },
    ],
  },
  {
    label: 'Configuración',
    items: [
      { path: '/settings', label: 'Preferencias', icon: Settings, phase: 3 },
      { path: '/settings/security', label: 'Seguridad', icon: Shield, phase: 3 },
    ],
  },
];

export function visibleNavigation(phase = CURRENT_PHASE): NavGroup[] {
  return NAVIGATION.map((g) => ({ ...g, items: g.items.filter((i) => i.phase <= phase) })).filter(
    (g) => g.items.length > 0,
  );
}

export function findNavItem(pathname: string): { group: NavGroup; item: NavItem } | undefined {
  for (const group of NAVIGATION) {
    const item = group.items.find((i) => i.path === pathname);
    if (item) return { group, item };
  }
  return undefined;
}
