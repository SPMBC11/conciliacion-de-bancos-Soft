import { Dialog as D } from 'radix-ui';
import { useState } from 'react';
import { Outlet } from 'react-router';
import { overlayClass } from '@/components/ui/dialog';
import { readPref, writePref } from '@/lib/storage';
import { Header } from './Header';
import { Sidebar } from './Sidebar';

export function AppLayout() {
  const [collapsed, setCollapsed] = useState(() => readPref('sidebar') === 'collapsed');
  const [mobileOpen, setMobileOpen] = useState(false);

  const toggle = () => {
    writePref('sidebar', collapsed ? 'expanded' : 'collapsed');
    setCollapsed(!collapsed);
  };

  return (
    <div className="flex min-h-dvh">
      <a
        href="#contenido"
        className="sr-only z-50 rounded-md bg-primary px-3 py-2 text-primary-foreground focus:not-sr-only focus:fixed focus:top-2 focus:left-2"
      >
        Saltar al contenido
      </a>

      {/* Escritorio: sidebar fijo y contraíble */}
      <div className="sticky top-0 hidden h-dvh shrink-0 lg:block">
        <Sidebar collapsed={collapsed} onToggle={toggle} />
      </div>

      {/* Móvil/tablet: cajón lateral */}
      <D.Root open={mobileOpen} onOpenChange={setMobileOpen}>
        <D.Portal>
          <D.Overlay className={`${overlayClass} lg:hidden`} />
          <D.Content aria-describedby={undefined} className="fixed inset-y-0 left-0 z-50 lg:hidden">
            <D.Title className="sr-only">Menú de navegación</D.Title>
            <Sidebar onNavigate={() => setMobileOpen(false)} />
          </D.Content>
        </D.Portal>
      </D.Root>

      <div className="flex min-w-0 flex-1 flex-col">
        <Header onOpenMenu={() => setMobileOpen(true)} />
        <main
          id="contenido"
          tabIndex={-1}
          className="mx-auto w-full max-w-7xl flex-1 p-4 outline-none sm:p-6"
        >
          <Outlet />
        </main>
      </div>
    </div>
  );
}
