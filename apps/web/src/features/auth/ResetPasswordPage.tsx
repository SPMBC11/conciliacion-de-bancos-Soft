import { zodResolver } from '@hookform/resolvers/zod';
import { PASSWORD_MIN_LENGTH, Password } from '@finagent/contracts';
import { useMutation } from '@tanstack/react-query';
import { useForm } from 'react-hook-form';
import { Link, useSearchParams } from 'react-router';
import { z } from 'zod';
import { Field, FormAlert } from '@/components/Form';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { AuthLayout } from '@/layouts/AuthLayout';
import { api, errorMessage } from '@/lib/api';

export const NewPasswordForm = z
  .object({ password: Password, confirm: z.string() })
  .refine((v) => v.password === v.confirm, {
    path: ['confirm'],
    message: 'Las contraseñas no coinciden.',
  });

export function ResetPasswordPage() {
  const [params] = useSearchParams();
  const token = params.get('token') ?? '';
  const form = useForm<z.infer<typeof NewPasswordForm>>({
    resolver: zodResolver(NewPasswordForm),
    defaultValues: { password: '', confirm: '' },
  });
  const reset = useMutation({
    mutationFn: (password: string) =>
      api('/api/auth/reset-password', { method: 'POST', body: { token, password } }),
  });
  const { errors } = form.formState;

  return (
    <AuthLayout
      title="Nueva contraseña"
      description="Por seguridad se cerrarán todas sus sesiones abiertas."
    >
      {reset.isSuccess ? (
        <div className="space-y-4">
          <FormAlert tone="success">Contraseña actualizada. Ya puede iniciar sesión.</FormAlert>
          <Button asChild className="w-full">
            <Link to="/login">Iniciar sesión</Link>
          </Button>
        </div>
      ) : (
        <form
          className="space-y-4"
          noValidate
          onSubmit={form.handleSubmit((d) => reset.mutate(d.password))}
        >
          {!token && <FormAlert>El enlace está incompleto. Solicite uno nuevo.</FormAlert>}
          {reset.isError && <FormAlert>{errorMessage(reset.error)}</FormAlert>}
          <Field
            label="Nueva contraseña"
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
          <Button type="submit" className="w-full" disabled={!token || reset.isPending}>
            Guardar contraseña
          </Button>
        </form>
      )}
    </AuthLayout>
  );
}
