import { zodResolver } from '@hookform/resolvers/zod';
import { InviteUserRequest } from '@finagent/contracts';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import type { ColumnDef } from '@tanstack/react-table';
import { UserPlus } from 'lucide-react';
import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { toast } from 'sonner';
import type { z } from 'zod';
import { useAuth } from '@/auth/auth-provider';
import { ConfirmationDialog } from '@/components/ConfirmationDialog';
import { DataTable } from '@/components/DataTable';
import { Field, FormAlert } from '@/components/Form';
import { PageHeader } from '@/components/PageHeader';
import { StatusBadge } from '@/components/StatusBadge';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent } from '@/components/ui/dialog';
import { Input, NativeSelect } from '@/components/ui/input';
import { api, errorMessage } from '@/lib/api';
import { formatDateTime } from '@/lib/datetime';
import { type InvitationRow, type MemberRow, useMembers, useOrgKey, useRoles } from './api';

type PendingChange =
  | { kind: 'role'; member: MemberRow; roleId: string; roleName: string }
  | { kind: 'status'; member: MemberRow; status: 'ACTIVE' | 'DISABLED' }
  | { kind: 'revoke'; invitation: InvitationRow };

export function UsersPage() {
  const { can, me } = useAuth();
  const canManage = can('users.manage');
  const members = useMembers();
  const roles = useRoles();
  const queryClient = useQueryClient();
  const usersKey = useOrgKey('users');
  const [inviteOpen, setInviteOpen] = useState(false);
  const [pending, setPending] = useState<PendingChange | null>(null);

  const refresh = () => queryClient.invalidateQueries({ queryKey: usersKey });
  const apply = useMutation({
    mutationFn: (change: PendingChange) => {
      if (change.kind === 'revoke')
        return api(`/api/users/invitations/${change.invitation.id}`, { method: 'DELETE' });
      const body = change.kind === 'role' ? { roleId: change.roleId } : { status: change.status };
      return api(`/api/users/${change.member.id}`, { method: 'PATCH', body });
    },
    onSuccess: () => {
      toast.success('Cambio guardado');
      refresh();
    },
    onError: (err) => toast.error(errorMessage(err)),
  });

  const memberColumns: ColumnDef<MemberRow, unknown>[] = [
    { id: 'name', accessorFn: (m) => m.user.fullName, header: 'Nombre' },
    { id: 'email', accessorFn: (m) => m.user.email, header: 'Correo' },
    {
      id: 'role',
      accessorFn: (m) => m.role.name,
      header: 'Rol',
      cell: ({ row: { original: m } }) =>
        canManage && m.user.id !== me?.user.id ? (
          <NativeSelect
            aria-label={`Rol de ${m.user.fullName}`}
            value={m.role.id}
            className="h-8"
            onChange={(e) => {
              const role = roles.data?.find((r) => r.id === e.target.value);
              if (role)
                setPending({ kind: 'role', member: m, roleId: role.id, roleName: role.name });
            }}
          >
            {roles.data?.map((r) => (
              <option key={r.id} value={r.id}>
                {r.name}
              </option>
            ))}
          </NativeSelect>
        ) : (
          m.role.name
        ),
    },
    {
      id: 'status',
      accessorFn: (m) => m.status,
      header: 'Estado',
      cell: ({ row: { original: m } }) => (
        <StatusBadge status={m.status === 'ACTIVE' ? 'USER_ACTIVE' : 'USER_DISABLED'} />
      ),
    },
    {
      id: 'lastLogin',
      accessorFn: (m) => m.user.lastLoginAt ?? '',
      header: 'Último ingreso',
      cell: ({ row: { original: m } }) => (
        <span className="tabular">{formatDateTime(m.user.lastLoginAt)}</span>
      ),
    },
    ...(canManage
      ? [
          {
            id: 'actions',
            header: '',
            enableSorting: false,
            cell: ({ row: { original: m } }) =>
              m.user.id === me?.user.id ? (
                <span className="text-xs text-muted-foreground">Usted</span>
              ) : (
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() =>
                    setPending({
                      kind: 'status',
                      member: m,
                      status: m.status === 'ACTIVE' ? 'DISABLED' : 'ACTIVE',
                    })
                  }
                >
                  {m.status === 'ACTIVE' ? 'Desactivar' : 'Reactivar'}
                </Button>
              ),
          } satisfies ColumnDef<MemberRow, unknown>,
        ]
      : []),
  ];

  const invitationColumns: ColumnDef<InvitationRow, unknown>[] = [
    { accessorKey: 'email', header: 'Correo' },
    { id: 'role', accessorFn: (i) => i.role.name, header: 'Rol' },
    {
      id: 'state',
      header: 'Estado',
      enableSorting: false,
      cell: () => <StatusBadge status="INVITED" />,
    },
    {
      accessorKey: 'expiresAt',
      header: 'Vence',
      cell: ({ getValue }) => (
        <span className="tabular">{formatDateTime(getValue() as string)}</span>
      ),
    },
    ...(canManage
      ? [
          {
            id: 'actions',
            header: '',
            enableSorting: false,
            cell: ({ row: { original: i } }) => (
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setPending({ kind: 'revoke', invitation: i })}
              >
                Revocar
              </Button>
            ),
          } satisfies ColumnDef<InvitationRow, unknown>,
        ]
      : []),
  ];

  const confirmText = (() => {
    if (!pending) return { title: '', description: '', label: '' };
    if (pending.kind === 'role')
      return {
        title: '¿Cambiar el rol?',
        description: `${pending.member.user.fullName} pasará a tener el rol ${pending.roleName}. Sus permisos cambian de inmediato.`,
        label: 'Cambiar rol',
      };
    if (pending.kind === 'status')
      return pending.status === 'DISABLED'
        ? {
            title: '¿Desactivar usuario?',
            description: `${pending.member.user.fullName} perderá el acceso a esta organización de inmediato. Su historial se conserva.`,
            label: 'Desactivar',
          }
        : {
            title: '¿Reactivar usuario?',
            description: `${pending.member.user.fullName} recuperará el acceso.`,
            label: 'Reactivar',
          };
    return {
      title: '¿Revocar invitación?',
      description: `El enlace enviado a ${pending.invitation.email} dejará de funcionar.`,
      label: 'Revocar',
    };
  })();

  return (
    <div className="space-y-6">
      <PageHeader
        title="Usuarios"
        description="Miembros de la organización e invitaciones pendientes. El registro es solo por invitación."
        actions={
          canManage && (
            <Button onClick={() => setInviteOpen(true)}>
              <UserPlus aria-hidden /> Invitar usuario
            </Button>
          )
        }
      />
      <DataTable
        caption="Miembros"
        columns={memberColumns}
        data={members.data?.members ?? []}
        isLoading={members.isPending}
        error={members.isError ? errorMessage(members.error) : null}
        onRetry={() => members.refetch()}
        searchPlaceholder="Buscar por nombre o correo…"
      />
      {!!members.data?.invitations.length && (
        <div className="space-y-2">
          <h2 className="text-sm font-semibold">Invitaciones pendientes</h2>
          <DataTable
            caption="Invitaciones pendientes"
            columns={invitationColumns}
            data={members.data.invitations}
          />
        </div>
      )}

      <InviteDialog open={inviteOpen} onOpenChange={setInviteOpen} onInvited={refresh} />
      <ConfirmationDialog
        open={!!pending}
        onOpenChange={(o) => !o && setPending(null)}
        title={confirmText.title}
        description={confirmText.description}
        confirmLabel={confirmText.label}
        tone={
          pending?.kind === 'role' || (pending?.kind === 'status' && pending.status === 'ACTIVE')
            ? 'primary'
            : 'danger'
        }
        onConfirm={() => pending && apply.mutate(pending)}
      />
    </div>
  );
}

type InviteData = z.infer<typeof InviteUserRequest>;

function InviteDialog({
  open,
  onOpenChange,
  onInvited,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  onInvited: () => void;
}) {
  const roles = useRoles();
  const form = useForm<InviteData>({
    resolver: zodResolver(InviteUserRequest),
    defaultValues: { email: '', roleId: '' },
  });
  const invite = useMutation({
    mutationFn: (data: InviteData) => api('/api/users/invitations', { method: 'POST', body: data }),
    onSuccess: (_, data) => {
      toast.success(`Invitación enviada a ${data.email}`);
      form.reset();
      onOpenChange(false);
      onInvited();
    },
  });
  const { errors } = form.formState;

  return (
    <Dialog open={open} onOpenChange={(o) => (invite.reset(), onOpenChange(o))}>
      <DialogContent
        title="Invitar usuario"
        description="Recibirá un enlace por correo válido 7 días."
      >
        <form
          className="space-y-4"
          noValidate
          onSubmit={form.handleSubmit((d) => invite.mutate(d))}
        >
          {invite.isError && <FormAlert>{errorMessage(invite.error)}</FormAlert>}
          <Field label="Correo electrónico" error={errors.email?.message}>
            {(p) => <Input {...p} type="email" autoFocus {...form.register('email')} />}
          </Field>
          <Field label="Rol" error={errors.roleId && 'Seleccione un rol.'}>
            {(p) => (
              <NativeSelect {...p} className="w-full" {...form.register('roleId')}>
                <option value="">Seleccione…</option>
                {roles.data?.map((r) => (
                  <option key={r.id} value={r.id}>
                    {r.name}
                  </option>
                ))}
              </NativeSelect>
            )}
          </Field>
          <div className="flex justify-end gap-2">
            <Button type="button" variant="secondary" onClick={() => onOpenChange(false)}>
              Cancelar
            </Button>
            <Button type="submit" disabled={invite.isPending}>
              Enviar invitación
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
