import { Menu } from 'lucide-react';
import { Breadcrumbs } from '@/components/Breadcrumbs';
import { Logo } from '@/components/Logo';
import { OrganizationSelector } from '@/components/OrganizationSelector';
import { UserMenu } from '@/components/UserMenu';
import { PeriodSelector } from '@/components/PeriodSelector';
import { ThemeSelector } from '@/components/ThemeSelector';
import { Button } from '@/components/ui/button';

/** Encabezado. El centro de notificaciones se agrega en la Fase 8 (sin controles sin funcionalidad). */
export function Header({ onOpenMenu }: { onOpenMenu: () => void }) {
  return (
    <header className="sticky top-0 z-30 flex h-14 items-center gap-3 border-b border-border bg-surface/85 px-4 backdrop-blur">
      <Button
        variant="ghost"
        size="icon"
        className="lg:hidden"
        aria-label="Abrir menú"
        onClick={onOpenMenu}
      >
        <Menu />
      </Button>
      <Logo className="lg:hidden" compact />
      <OrganizationSelector />
      <Breadcrumbs />
      <div className="ml-auto flex items-center gap-2">
        <PeriodSelector />
        <ThemeSelector />
        <UserMenu />
      </div>
    </header>
  );
}
