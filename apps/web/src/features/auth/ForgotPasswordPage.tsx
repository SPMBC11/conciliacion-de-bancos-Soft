import { zodResolver } from '@hookform/resolvers/zod';
import { ForgotPasswordRequest } from '@finagent/contracts';
import { useMutation } from '@tanstack/react-query';
import { useForm } from 'react-hook-form';
import { Link } from 'react-router';
import type { z } from 'zod';
import { Field, FormAlert } from '@/components/Form';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { AuthLayout } from '@/layouts/AuthLayout';
import { api, errorMessage } from '@/lib/api';

type Data = z.infer<typeof ForgotPasswordRequest>;

export function ForgotPasswordPage() {
  const form = useForm<Data>({
    resolver: zodResolver(ForgotPasswordRequest),
    defaultValues: { email: '' },
  });
  const send = useMutation({
    mutationFn: (data: Data) =>
      api<{ message: string }>('/api/auth/forgot-password', { method: 'POST', body: data }),
  });

  return (
    <AuthLayout
      title="Recuperar contraseña"
      description="Le enviaremos un enlace válido por 1 hora."
    >
      {send.isSuccess ? (
        <div className="space-y-4">
          <FormAlert tone="success">{send.data.message}</FormAlert>
          <Button asChild variant="secondary" className="w-full">
            <Link to="/login">Volver al inicio de sesión</Link>
          </Button>
        </div>
      ) : (
        <form className="space-y-4" noValidate onSubmit={form.handleSubmit((d) => send.mutate(d))}>
          {send.isError && <FormAlert>{errorMessage(send.error)}</FormAlert>}
          <Field label="Correo electrónico" error={form.formState.errors.email?.message}>
            {(p) => (
              <Input
                {...p}
                type="email"
                autoComplete="username"
                autoFocus
                {...form.register('email')}
              />
            )}
          </Field>
          <Button type="submit" className="w-full" disabled={send.isPending}>
            Enviar enlace
          </Button>
          <p className="text-center text-sm">
            <Link to="/login" className="text-primary hover:underline dark:text-primary-hover">
              Volver
            </Link>
          </p>
        </form>
      )}
    </AuthLayout>
  );
}
