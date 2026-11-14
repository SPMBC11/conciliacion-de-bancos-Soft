import { zodResolver } from '@hookform/resolvers/zod';
import { CreateOrganizationRequest } from '@finagent/contracts';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useForm } from 'react-hook-form';
import type { z } from 'zod';
import { useAuth } from '@/auth/auth-provider';
import { Field, FormAlert } from '@/components/Form';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { AuthLayout } from '@/layouts/AuthLayout';
import { api, errorMessage } from '@/lib/api';
import { writePref } from '@/lib/storage';

type Data = z.input<typeof CreateOrganizationRequest>;

/** Usuario sin organizaciones activas: puede crear una (queda como Propietario) o esperar una invitación. */
export function NoOrganizationPage() {
  const { me, logout } = useAuth();
  const queryClient = useQueryClient();
  const form = useForm<Data>({
    resolver: zodResolver(CreateOrganizationRequest),
    defaultValues: { nit: '', legalName: '' },
  });
  const create = useMutation({
    mutationFn: (data: Data) =>
      api<{ id: string }>('/api/organizations', { method: 'POST', body: data }),
    onSuccess: async (org) => {
      writePref('org', org.id);
      await queryClient.invalidateQueries({ queryKey: ['auth', 'me'] });
    },
  });
  const { errors } = form.formState;

  return (
    <AuthLayout
      title="Sin organización"
      description={`${me?.user.fullName ?? ''}, su cuenta no pertenece a ninguna organización activa. Pida una invitación o cree una nueva.`}
    >
      <form className="space-y-4" noValidate onSubmit={form.handleSubmit((d) => create.mutate(d))}>
        {create.isError && <FormAlert>{errorMessage(create.error)}</FormAlert>}
        <Field label="NIT" error={errors.nit?.message} hint="Ej. 900123456-7">
          {(p) => <Input {...p} inputMode="numeric" {...form.register('nit')} />}
        </Field>
        <Field label="Razón social" error={errors.legalName?.message}>
          {(p) => <Input {...p} {...form.register('legalName')} />}
        </Field>
        <Button type="submit" className="w-full" disabled={create.isPending}>
          Crear organización
        </Button>
        <Button type="button" variant="ghost" className="w-full" onClick={() => logout()}>
          Cerrar sesión
        </Button>
      </form>
    </AuthLayout>
  );
}
