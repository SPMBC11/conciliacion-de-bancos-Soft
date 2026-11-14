import { zodResolver } from '@hookform/resolvers/zod';
import { LoginRequest, type MeResponse } from '@finagent/contracts';
import { useMutation } from '@tanstack/react-query';
import { useForm } from 'react-hook-form';
import { Link, useNavigate, useSearchParams } from 'react-router';
import { useAuth } from '@/auth/auth-provider';
import { safeNext } from '@/auth/guards';
import { Field, FormAlert } from '@/components/Form';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { AuthLayout } from '@/layouts/AuthLayout';
import { api, errorMessage } from '@/lib/api';

export function LoginPage() {
  const { signedIn } = useAuth();
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const form = useForm<LoginRequest>({
    resolver: zodResolver(LoginRequest),
    defaultValues: { email: '', password: '' },
  });
  const login = useMutation({
    mutationFn: (data: LoginRequest) =>
      api<MeResponse>('/api/auth/login', { method: 'POST', body: data }),
    onSuccess: (me) => {
      signedIn(me);
      navigate(safeNext(params.get('next')), { replace: true });
    },
  });
  const { errors } = form.formState;

  return (
    <AuthLayout title="Iniciar sesión" description="Ingrese con el correo de su invitación.">
      <form className="space-y-4" noValidate onSubmit={form.handleSubmit((d) => login.mutate(d))}>
        {login.isError && <FormAlert>{errorMessage(login.error)}</FormAlert>}
        <Field label="Correo electrónico" error={errors.email?.message}>
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
        <Field label="Contraseña" error={errors.password && 'Escriba su contraseña.'}>
          {(p) => (
            <Input
              {...p}
              type="password"
              autoComplete="current-password"
              {...form.register('password')}
            />
          )}
        </Field>
        <Button type="submit" className="w-full" disabled={login.isPending}>
          {login.isPending ? 'Ingresando…' : 'Ingresar'}
        </Button>
        <p className="text-center text-sm">
          <Link
            to="/forgot-password"
            className="text-primary hover:underline dark:text-primary-hover"
          >
            ¿Olvidó su contraseña?
          </Link>
        </p>
      </form>
    </AuthLayout>
  );
}
