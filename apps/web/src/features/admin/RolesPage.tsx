import { PERMISSIONS, type PermissionKey } from '@finagent/contracts';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Lock, Pencil, Plus } from 'lucide-react';
import { useState } from 'react';
import { toast } from 'sonner';
import { useAuth } from '@/auth/auth-provider';
import { FormAlert } from '@/components/Form';
import { PageHeader } from '@/components/PageHeader';
import { ErrorState, LoadingState } from '@/components/States';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Dialog, DialogContent } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { api, errorMessage } from '@/lib/api';
import { type RoleRow, useOrgKey, useRoles } from './api';

const GROUPS: Record<string, string> = {
  organization: 'Organización',
  users: 'Usuarios',
  roles: 'Roles',
  audit: 'Auditoría',
  bank_accounts: 'Cuentas bancarias',
  master_data: 'Datos maestros',
  documents: 'Documentos',
  rules: 'Reglas',
  reconciliations: 'Conciliaciones',
  adjustments: 'Ajustes',
  reports: 'Informes',
};

const grouped = Object.entries(
  (Object.keys(PERMISSIONS) as PermissionKey[]).reduce<Record<string, PermissionKey[]>>(
    (acc, key) => {
      (acc[key.split('.')[0]!] ??= []).push(key);
      return acc;
    },
    {},
  ),
);

export function RolesPage() {
  const { can, membership } = useAuth();
  const roles = useRoles();
  const [editing, setEditing] = useState<RoleRow | 'new' | null>(null);

  if (roles.isPending) return <LoadingState rows={6} />;
  if (roles.isError)
    return <ErrorState message={errorMessage(roles.error)} onRetry={() => roles.refetch()} />;

  return (
    <div className="space-y-6">
      <PageHeader
        title="Roles y permisos"
        description="Los roles de sistema no se modifican. Puede crear roles propios con los permisos que usted tenga."
        actions={
          can('roles.manage') && (
            <Button onClick={() => setEditing('new')}>
              <Plus aria-hidden /> Nuevo rol
            </Button>
          )
        }
      />
      <div className="grid gap-4 lg:grid-cols-2">
        {roles.data.map((role) => (
          <Card key={role.id}>
            <CardHeader>
              <div>
                <CardTitle className="flex items-center gap-2">
                  {role.name}
                  {role.isSystem && (
                    <span className="inline-flex items-center gap-1 text-xs font-normal text-muted-foreground">
                      <Lock aria-hidden className="size-3" /> Sistema
                    </span>
                  )}
                </CardTitle>
                <p className="mt-1 text-xs text-muted-foreground">
                  {role.permissions.length} permisos · {role.memberCount} miembros
                  {role.id === membership?.role.id && ' · Su rol'}
                </p>
              </div>
              {!role.isSystem && can('roles.manage') && role.id !== membership?.role.id && (
                <Button variant="ghost" size="sm" onClick={() => setEditing(role)}>
                  <Pencil aria-hidden /> Editar
                </Button>
              )}
            </CardHeader>
            <CardContent>
              {role.description && <p className="mb-3 text-sm">{role.description}</p>}
              <ul className="flex flex-wrap gap-1">
                {role.permissions.map((p) => (
                  <li
                    key={p}
                    title={PERMISSIONS[p as PermissionKey]}
                    className="rounded-md bg-surface-secondary px-2 py-0.5 text-xs"
                  >
                    {PERMISSIONS[p as PermissionKey] ?? p}
                  </li>
                ))}
              </ul>
            </CardContent>
          </Card>
        ))}
      </div>
      {editing && (
        <RoleDialog role={editing === 'new' ? null : editing} onClose={() => setEditing(null)} />
      )}
    </div>
  );
}

function RoleDialog({ role, onClose }: { role: RoleRow | null; onClose: () => void }) {
  const { can } = useAuth();
  const queryClient = useQueryClient();
  const rolesKey = useOrgKey('roles');
  const [name, setName] = useState(role?.name ?? '');
  const [description, setDescription] = useState(role?.description ?? '');
  const [selected, setSelected] = useState(new Set(role?.permissions ?? []));

  const save = useMutation({
    mutationFn: () => {
      const body = { name, description: description || undefined, permissions: [...selected] };
      return role
        ? api(`/api/roles/${role.id}`, { method: 'PATCH', body })
        : api('/api/roles', { method: 'POST', body });
    },
    onSuccess: () => {
      toast.success(role ? 'Rol actualizado' : 'Rol creado');
      queryClient.invalidateQueries({ queryKey: rolesKey });
      onClose();
    },
  });

  const toggle = (key: string) =>
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent title={role ? `Editar rol: ${role.name}` : 'Nuevo rol'} className="max-w-2xl">
        <form
          className="space-y-4"
          onSubmit={(e) => {
            e.preventDefault();
            save.mutate();
          }}
        >
          {save.isError && <FormAlert>{errorMessage(save.error)}</FormAlert>}
          <div className="grid gap-3 sm:grid-cols-2">
            <label className="space-y-1 text-sm font-medium">
              Nombre
              <Input
                value={name}
                onChange={(e) => setName(e.target.value)}
                required
                minLength={3}
              />
            </label>
            <label className="space-y-1 text-sm font-medium">
              Descripción (opcional)
              <Input value={description} onChange={(e) => setDescription(e.target.value)} />
            </label>
          </div>
          <div className="max-h-[50vh] space-y-3 overflow-y-auto pr-1">
            {grouped.map(([group, keys]) => (
              <fieldset key={group}>
                <legend className="mb-1 text-xs font-semibold tracking-wider text-muted-foreground uppercase">
                  {GROUPS[group] ?? group}
                </legend>
                <div className="grid gap-1 sm:grid-cols-2">
                  {keys.map((key) => (
                    <label
                      key={key}
                      className={`flex items-start gap-2 rounded-md p-1.5 text-sm ${can(key) ? 'hover:bg-surface-secondary' : 'opacity-50'}`}
                      title={
                        can(key) ? undefined : 'No puede otorgar un permiso que usted no tiene'
                      }
                    >
                      <input
                        type="checkbox"
                        className="mt-0.5"
                        checked={selected.has(key)}
                        disabled={!can(key)}
                        onChange={() => toggle(key)}
                      />
                      {PERMISSIONS[key]}
                    </label>
                  ))}
                </div>
              </fieldset>
            ))}
          </div>
          <div className="flex items-center justify-between gap-2">
            <span className="text-sm text-muted-foreground">
              {selected.size} permisos seleccionados
            </span>
            <div className="flex gap-2">
              <Button type="button" variant="secondary" onClick={onClose}>
                Cancelar
              </Button>
              <Button
                type="submit"
                disabled={save.isPending || selected.size === 0 || name.trim().length < 3}
              >
                Guardar
              </Button>
            </div>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
