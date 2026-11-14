import { LogOut, Settings, Shield } from 'lucide-react';
import { useNavigate } from 'react-router';
import { useAuth } from '@/auth/auth-provider';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';

export function initials(name: string) {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0]!.toUpperCase())
    .join('');
}

export function UserMenu() {
  const { me, membership, logout } = useAuth();
  const navigate = useNavigate();
  if (!me) return null;
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          variant="ghost"
          size="icon"
          aria-label={`Menú de ${me.user.fullName}`}
          className="rounded-full"
        >
          <span className="grid size-8 place-items-center rounded-full bg-primary/10 text-xs font-semibold text-primary dark:text-primary-hover">
            {initials(me.user.fullName)}
          </span>
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent className="min-w-56">
        <div className="px-2 py-1.5">
          <p className="text-sm font-medium">{me.user.fullName}</p>
          <p className="text-xs text-muted-foreground">{me.user.email}</p>
          {membership && (
            <p className="mt-1 text-xs text-muted-foreground">Rol: {membership.role.name}</p>
          )}
        </div>
        <div className="my-1 h-px bg-border" />
        <DropdownMenuItem onSelect={() => navigate('/settings')}>
          <Settings aria-hidden /> Preferencias
        </DropdownMenuItem>
        <DropdownMenuItem onSelect={() => navigate('/settings/security')}>
          <Shield aria-hidden /> Seguridad
        </DropdownMenuItem>
        <DropdownMenuItem onSelect={() => logout().then(() => navigate('/login'))}>
          <LogOut aria-hidden /> Cerrar sesión
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
