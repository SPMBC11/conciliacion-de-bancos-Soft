import { PanelLeftClose, PanelLeftOpen, Palette } from 'lucide-react';
import { NavLink } from 'react-router';
import { type NavItem, visibleNavigation } from '@/app/navigation';
import { useAuth } from '@/auth/auth-provider';
import { Logo } from '@/components/Logo';
import { Tooltip } from '@/components/ui/tooltip';
import { cn } from '@/lib/utils';

/** Solo en desarrollo: galería de componentes para revisar el design system. */
const DEV_ITEMS: NavItem[] = import.meta.env.DEV
  ? [{ path: '/design-system', label: 'Design system', icon: Palette, phase: 2 }]
  : [];

function SidebarLink({
  item,
  collapsed,
  onNavigate,
}: {
  item: NavItem;
  collapsed: boolean;
  onNavigate?: () => void;
}) {
  const link = (
    <NavLink
      to={item.path}
      end
      onClick={onNavigate}
      className={({ isActive }) =>
        cn(
          'flex h-9 items-center gap-3 rounded-lg px-3 text-sm transition-colors',
          collapsed && 'justify-center px-0',
          isActive
            ? 'bg-primary/10 font-medium text-primary dark:text-primary-hover'
            : 'text-muted-foreground hover:bg-surface-secondary hover:text-foreground',
        )
      }
    >
      <item.icon aria-hidden className="size-4 shrink-0" />
      {collapsed ? (
        <span className="sr-only">{item.label}</span>
      ) : (
        <span className="truncate">{item.label}</span>
      )}
    </NavLink>
  );
  return collapsed ? (
    <Tooltip content={item.label} side="right">
      {link}
    </Tooltip>
  ) : (
    link
  );
}

type SidebarProps = {
  collapsed?: boolean;
  onToggle?: () => void;
  onNavigate?: () => void;
  className?: string;
};

export function Sidebar({ collapsed = false, onToggle, onNavigate, className }: SidebarProps) {
  const { can } = useAuth();
  const groups = visibleNavigation(undefined, can);
  if (DEV_ITEMS.length) groups.push({ label: 'Desarrollo', items: DEV_ITEMS });

  return (
    <aside
      className={cn(
        'flex h-full flex-col border-r border-border bg-surface',
        collapsed ? 'w-16' : 'w-64',
        className,
      )}
    >
      <div
        className={cn(
          'flex h-14 items-center border-b border-border px-4',
          collapsed && 'justify-center px-0',
        )}
      >
        <Logo compact={collapsed} />
      </div>
      <nav aria-label="Navegación principal" className="flex-1 space-y-5 overflow-y-auto p-3">
        {groups.map((group) => (
          <div key={group.label}>
            {collapsed ? (
              <div aria-hidden className="mx-auto mb-2 h-px w-6 bg-border" />
            ) : (
              <p className="mb-1 px-3 text-[11px] font-semibold tracking-wider text-muted-foreground uppercase">
                {group.label}
              </p>
            )}
            <ul className="space-y-0.5">
              {group.items.map((item) => (
                <li key={item.path}>
                  <SidebarLink item={item} collapsed={collapsed} onNavigate={onNavigate} />
                </li>
              ))}
            </ul>
          </div>
        ))}
      </nav>
      {onToggle && (
        <div className="border-t border-border p-3">
          <button
            type="button"
            onClick={onToggle}
            aria-label={collapsed ? 'Expandir menú' : 'Contraer menú'}
            aria-expanded={!collapsed}
            className={cn(
              'flex h-9 w-full items-center gap-3 rounded-lg px-3 text-sm text-muted-foreground hover:bg-surface-secondary hover:text-foreground',
              collapsed && 'justify-center px-0',
            )}
          >
            {collapsed ? (
              <PanelLeftOpen aria-hidden className="size-4" />
            ) : (
              <PanelLeftClose aria-hidden className="size-4" />
            )}
            {!collapsed && 'Contraer menú'}
          </button>
        </div>
      )}
    </aside>
  );
}
