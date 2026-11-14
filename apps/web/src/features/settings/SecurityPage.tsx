import { zodResolver } from '@hookform/resolvers/zod';
import { PASSWORD_MIN_LENGTH, Password } from '@finagent/contracts';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Monitor } from 'lucide-react';
import { useForm } from 'react-hook-form';
import { toast } from 'sonner';
import { z } from 'zod';
import { Field, FormAlert } from '@/components/Form';
import { PageHeader } from '@/components/PageHeader';
import { ErrorState, LoadingState } from '@/components/States';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { api, errorMessage } from '@/lib/api';
import { formatDateTime } from '@/lib/datetime';

type Session = {
  familyId: string;
  userAgent: string | null;
  ip: string | null;
  createdAt: string;
  lastUsedAt: string;
  current: boolean;
};

const ChangePasswordForm = z
  .object({
    currentPassword: z.string().min(1, 'Escriba su contraseña actual.'),
    newPassword: Password,
    confirm: z.string(),
  })
  .refine((v) => v.newPassword === v.confirm, {
    path: ['confirm'],
    message: 'Las contraseñas no coinciden.',
  });
type ChangeData = z.infer<typeof ChangePasswordForm>;

/** Navegador y sistema aproximados a partir del User-Agent. */
export function describeAgent(ua: string | null) {
  if (!ua) return 'Dispositivo desconocido';
  const browser = /Edg\//.test(ua)
    ? 'Edge'
    : /Chrome\//.test(ua)
      ? 'Chrome'
      : /Firefox\//.test(ua)
        ? 'Firefox'
        : /Safari\//.test(ua)
          ? 'Safari'
          : 'Navegador';
  const os = /Windows/.test(ua)
    ? 'Windows'
    : /Mac OS/.test(ua)
      ? 'macOS'
      : /Android/.test(ua)
        ? 'Android'
        : /iPhone|iPad/.test(ua)
          ? 'iOS'
          : /Linux/.test(ua)
            ? 'Linux'
            : '';
  return os ? `${browser} en ${os}` : browser;
}

export function SecurityPage() {
  const queryClient = useQueryClient();
  const sessions = useQuery({
    queryKey: ['auth', 'sessions'],
    queryFn: () => api<Session[]>('/api/auth/sessions'),
  });
  const form = useForm<ChangeData>({
    resolver: zodResolver(ChangePasswordForm),
    defaultValues: { currentPassword: '', newPassword: '', confirm: '' },
  });
  const change = useMutation({
    mutationFn: (d: ChangeData) =>
      api('/api/auth/change-password', {
        method: 'POST',
        body: { currentPassword: d.currentPassword, newPassword: d.newPassword },
      }),
    onSuccess: () => {
      toast.success('Contraseña actualizada. Se cerraron sus otras sesiones.');
      form.reset();
      queryClient.invalidateQueries({ queryKey: ['auth', 'sessions'] });
    },
  });
  const revoke = useMutation({
    mutationFn: (familyId: string) => api(`/api/auth/sessions/${familyId}`, { method: 'DELETE' }),
    onSuccess: () => {
      toast.success('Sesión cerrada');
      queryClient.invalidateQueries({ queryKey: ['auth', 'sessions'] });
    },
    onError: (err) => toast.error(errorMessage(err)),
  });
  const { errors } = form.formState;

  return (
    <div className="space-y-6">
      <PageHeader title="Seguridad" description="Contraseña y sesiones abiertas de su cuenta." />
      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Cambiar contraseña</CardTitle>
          </CardHeader>
          <CardContent>
            <form
              className="space-y-4"
              noValidate
              onSubmit={form.handleSubmit((d) => change.mutate(d))}
            >
              {change.isError && <FormAlert>{errorMessage(change.error)}</FormAlert>}
              <Field label="Contraseña actual" error={errors.currentPassword?.message}>
                {(p) => (
                  <Input
                    {...p}
                    type="password"
                    autoComplete="current-password"
                    {...form.register('currentPassword')}
                  />
                )}
              </Field>
              <Field
                label="Nueva contraseña"
                error={errors.newPassword?.message}
                hint={`Mínimo ${PASSWORD_MIN_LENGTH} caracteres.`}
              >
                {(p) => (
                  <Input
                    {...p}
                    type="password"
                    autoComplete="new-password"
                    {...form.register('newPassword')}
                  />
                )}
              </Field>
              <Field label="Confirmar nueva contraseña" error={errors.confirm?.message}>
                {(p) => (
                  <Input
                    {...p}
                    type="password"
                    autoComplete="new-password"
                    {...form.register('confirm')}
                  />
                )}
              </Field>
              <Button type="submit" disabled={change.isPending}>
                Actualizar contraseña
              </Button>
            </form>
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>Sesiones abiertas</CardTitle>
          </CardHeader>
          <CardContent>
            {sessions.isPending && <LoadingState rows={2} />}
            {sessions.isError && (
              <ErrorState
                message={errorMessage(sessions.error)}
                onRetry={() => sessions.refetch()}
              />
            )}
            <ul className="divide-y divide-border">
              {sessions.data?.map((s) => (
                <li key={s.familyId} className="flex items-center gap-3 py-3">
                  <Monitor aria-hidden className="size-5 shrink-0 text-muted-foreground" />
                  <div className="min-w-0 flex-1 text-sm">
                    <p className="font-medium">
                      {describeAgent(s.userAgent)}
                      {s.current && (
                        <span className="ml-2 text-xs font-normal text-success-text">
                          Esta sesión
                        </span>
                      )}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      IP {s.ip ?? '—'} · Última actividad {formatDateTime(s.lastUsedAt)}
                    </p>
                  </div>
                  {!s.current && (
                    <Button
                      variant="ghost"
                      size="sm"
                      disabled={revoke.isPending}
                      onClick={() => revoke.mutate(s.familyId)}
                    >
                      Cerrar
                    </Button>
                  )}
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
