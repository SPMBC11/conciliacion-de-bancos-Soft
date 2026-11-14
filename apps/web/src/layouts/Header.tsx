import { Menu } from 'lucide-react';
import { Breadcrumbs } from '@/components/Breadcrumbs';
import { Logo } from '@/components/Logo';
import { PeriodSelector } from '@/components/PeriodSelector';
import { ThemeSelector } from '@/components/ThemeSelector';
import { Button } from '@/components/ui/button';

/**
 * Encabezado. Selector de organización, notificaciones y perfil se agregan en la Fase 3
 * (dependen de autenticación): no se muestran controles sin funcionalidad.
 */
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
      <Breadcrumbs />
      <div className="ml-auto flex items-center gap-2">
        <PeriodSelector />
        <ThemeSelector />
      </div>
    </header>
  );
}
