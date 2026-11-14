import { Building2, Check, ChevronsUpDown } from 'lucide-react';
import { useNavigate } from 'react-router';
import { useAuth } from '@/auth/auth-provider';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';

export function OrganizationSelector() {
  const { me, membership, selectOrganization } = useAuth();
  const navigate = useNavigate();
  if (!me || !membership) return null;

  const label = (
    <>
      <Building2 aria-hidden />
      <span className="max-w-40 truncate">{membership.organizationName}</span>
    </>
  );
  if (me.memberships.length === 1) {
    return (
      <span className="hidden items-center gap-2 text-sm font-medium sm:inline-flex [&_svg]:size-4">
        {label}
      </span>
    );
  }
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          variant="ghost"
          size="sm"
          aria-label={`Organización: ${membership.organizationName}. Cambiar`}
        >
          {label}
          <ChevronsUpDown aria-hidden className="opacity-60" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="min-w-64">
        {me.memberships.map((m) => (
          <DropdownMenuItem
            key={m.organizationId}
            onSelect={() => {
              selectOrganization(m.organizationId);
              navigate('/dashboard');
            }}
          >
            <Check
              aria-hidden
              className={m.organizationId === membership.organizationId ? '' : 'invisible'}
            />
            <span className="flex flex-col">
              <span>{m.organizationName}</span>
              <span className="text-xs text-muted-foreground">
                NIT {m.nit} · {m.role.name}
              </span>
            </span>
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
