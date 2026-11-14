import { zodResolver } from '@hookform/resolvers/zod';
import { type MeResponse, PASSWORD_MIN_LENGTH, Password } from '@finagent/contracts';
import { useMutation, useQuery } from '@tanstack/react-query';
import { useForm } from 'react-hook-form';
import { Link, useNavigate, useSearchParams } from 'react-router';
import { z } from 'zod';
import { useAuth } from '@/auth/auth-provider';
import { Field, FormAlert } from '@/components/Form';
import { LoadingState } from '@/components/States';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { AuthLayout } from '@/layouts/AuthLayout';
import { api, errorMessage } from '@/lib/api';
import { writePref } from '@/lib/storage';

type Preview = {
  email: string;
  organizationName: string;
  roleName: string;
  existingAccount: boolean;
};

const NewAccount = z
  .object({
    fullName: z.string().trim().min(3, 'Escriba su nombre completo.'),
    password: Password,
    confirm: z.string(),
  })
  .refine((v) => v.password === v.confirm, {
    path: ['confirm'],
    message: 'Las contraseñas no coinciden.',
  });
const ExistingAccount = z.object({
  fullName: z.string(),
  password: z.string().min(1, 'Escriba su contraseña actual.'),
  confirm: z.string(),
});
type FormData = z.infer<typeof NewAccount>;

export function AcceptInvitationPage() {
  const [params] = useSearchParams();
  const token = params.get('token') ?? '';
  const preview = useQuery({
    queryKey: ['invitation', token],
    queryFn: () => api<Preview>(`/api/auth/invitations/${encodeURIComponent(token)}`),
    enabled: !!token,
    retry: false,
  });

  if (!token || preview.isError) {
    return (
      <AuthLayout title="Invitación no válida">
        <FormAlert>{token ? errorMessage(preview.error) : 'El enlace está incompleto.'}</FormAlert>
        <Button asChild variant="secondary" className="mt-4 w-full">
          <Link to="/login">Ir al inicio de sesión</Link>
        </Button>
      </AuthLayout>
    );
  }
  if (!preview.data) return <LoadingState rows={3} label="Verificando invitación…" />;
  return <AcceptForm token={token} preview={preview.data} />;
}

function AcceptForm({ token, preview }: { token: string; preview: Preview }) {
  const { signedIn } = useAuth();
  const navigate = useNavigate();
  const form = useForm<FormData>({
    resolver: zodResolver<FormData, unknown, FormData>(
      preview.existingAccount ? ExistingAccount : NewAccount,
    ),
    defaultValues: { fullName: '', password: '', confirm: '' },
  });
  const accept = useMutation({
    mutationFn: (d: FormData) =>
      api<MeResponse>('/api/auth/accept-invitation', {
        method: 'POST',
        body: {
          token,
          password: d.password,
          ...(!preview.existingAccount && { fullName: d.fullName }),
        },
      }),
    onSuccess: (me) => {
      const joined = me.memberships.find((m) => m.organizationName === preview.organizationName);
      if (joined) writePref('org', joined.organizationId);
      signedIn(me);
      navigate('/dashboard', { replace: true });
    },
  });
  const { errors } = form.formState;

  return (
    <AuthLayout
      title={`Unirse a ${preview.organizationName}`}
      description={
        <>
          Invitación para <strong>{preview.email}</strong> con el rol{' '}
          <strong>{preview.roleName}</strong>.
        </>
      }
    >
      <form className="space-y-4" noValidate onSubmit={form.handleSubmit((d) => accept.mutate(d))}>
        {accept.isError && <FormAlert>{errorMessage(accept.error)}</FormAlert>}
        {preview.existingAccount ? (
          <Field
            label="Contraseña de su cuenta"
            error={errors.password?.message}
            hint="Ya tiene cuenta en FinAgent con este correo."
          >
            {(p) => (
              <Input
                {...p}
                type="password"
                autoComplete="current-password"
                {...form.register('password')}
              />
            )}
          </Field>
        ) : (
          <>
            <Field label="Nombre completo" error={errors.fullName?.message}>
              {(p) => <Input {...p} autoComplete="name" autoFocus {...form.register('fullName')} />}
            </Field>
            <Field
              label="Contraseña"
              error={errors.password?.message}
              hint={`Mínimo ${PASSWORD_MIN_LENGTH} caracteres.`}
            >
              {(p) => (
                <Input
                  {...p}
                  type="password"
                  autoComplete="new-password"
                  {...form.register('password')}
                />
              )}
            </Field>
            <Field label="Confirmar contraseña" error={errors.confirm?.message}>
              {(p) => (
                <Input
                  {...p}
                  type="password"
                  autoComplete="new-password"
                  {...form.register('confirm')}
                />
              )}
            </Field>
          </>
        )}
        <Button type="submit" className="w-full" disabled={accept.isPending}>
          Aceptar invitación
        </Button>
      </form>
    </AuthLayout>
  );
}
