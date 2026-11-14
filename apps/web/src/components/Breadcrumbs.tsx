import { ChevronRight } from 'lucide-react';
import { useLocation } from 'react-router';
import { findNavItem } from '@/app/navigation';

export function Breadcrumbs() {
  const { pathname } = useLocation();
  const found = findNavItem(pathname);
  if (!found) return null;
  return (
    <nav
      aria-label="Ruta de navegación"
      className="hidden min-w-0 items-center gap-1 text-sm md:flex"
    >
      <span className="text-muted-foreground">{found.group.label}</span>
      <ChevronRight aria-hidden className="size-3.5 text-muted-foreground" />
      <span aria-current="page" className="truncate font-medium">
        {found.item.label}
      </span>
    </nav>
  );
}
