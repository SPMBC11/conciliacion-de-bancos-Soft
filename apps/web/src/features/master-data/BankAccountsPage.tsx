import { zodResolver } from '@hookform/resolvers/zod';
import { CreateBankAccountRequest } from '@finagent/contracts';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import type { ColumnDef } from '@tanstack/react-table';
import { Eye, Pencil, Plus } from 'lucide-react';
import { useState } from 'react';
import { Controller, useForm } from 'react-hook-form';
import { Link } from 'react-router';
import { toast } from 'sonner';
import { z } from 'zod';
import { useAuth } from '@/auth/auth-provider';
import { DataTable } from '@/components/DataTable';
import { Field, FormAlert } from '@/components/Form';
import { MoneyCell } from '@/components/MoneyCell';
import { PageHeader } from '@/components/PageHeader';
import { EmptyState } from '@/components/States';
import { StatusBadge } from '@/components/StatusBadge';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent } from '@/components/ui/dialog';
import { Input, NativeSelect } from '@/components/ui/input';
import { useOrgKey } from '@/features/admin/api';
import { api, errorMessage } from '@/lib/api';
import { formatDate, parseLocalAmount, toLocalAmountInput } from '@/lib/format';
import { type BankAccount, glLabel, useBankAccounts, useBanks, useGlAccounts } from './api';

const TYPE_LABEL = { CORRIENTE: 'Corriente', AHORROS: 'Ahorros' } as const;

export function BankAccountsPage() {
  const { can } = useAuth();
  const accounts = useBankAccounts();
  const glAccounts = useGlAccounts();
  const [editing, setEditing] = useState<BankAccount | 'new' | null>(null);
  const [revealed, setRevealed] = useState<Record<string, string>>({});
  const canManage = can('bank_accounts.manage');

  const reveal = useMutation({
    mutationFn: (id: string) =>
      api<{ accountNumber: string }>(`/api/bank-accounts/${id}/reveal-number`, { method: 'POST' }),
    onSuccess: (data, id) => {
      setRevealed((r) => ({ ...r, [id]: data.accountNumber }));
      // El número completo se oculta de nuevo a los 30 s (minimiza exposición en pantalla).
      setTimeout(() => setRevealed(({ [id]: _, ...rest }) => rest), 30_000);
    },
    onError: (err) => toast.error(errorMessage(err)),
  });

  const columns: ColumnDef<BankAccount, unknown>[] = [
    { id: 'bank', accessorFn: (a) => a.bank.name, header: 'Banco' },
    { accessorKey: 'name', header: 'Nombre' },
    {
      id: 'number',
      accessorFn: (a) => a.maskedNumber,
      header: 'Número',
      cell: ({ row: { original: a } }) => (
        <span className="inline-flex items-center gap-1 tabular">
          {revealed[a.id] ?? a.maskedNumber}
          {canManage && !revealed[a.id] && (
            <Button
              variant="ghost"
              size="icon"
              className="size-7"
              aria-label={`Ver número completo de ${a.name} (queda en auditoría)`}
              title="Ver número completo (queda en auditoría)"
              onClick={() => reveal.mutate(a.id)}
            >
              <Eye />
            </Button>
          )}
        </span>
      ),
    },
    { id: 'type', accessorFn: (a) => TYPE_LABEL[a.type], header: 'Tipo' },
    { accessorKey: 'currency', header: 'Moneda' },
    {
      id: 'gl',
      accessorFn: (a) => a.glAccount.code,
      header: 'Cuenta PUC',
      cell: ({ row }) => <span className="tabular">{row.original.glAccount.code}</span>,
    },
    {
      accessorKey: 'openingBalance',
      header: 'Saldo inicial',
      meta: { align: 'right' },
      enableSorting: false,
      cell: ({ row: { original: a } }) => (
        <MoneyCell amount={a.openingBalance} currency={a.currency} />
      ),
    },
    {
      accessorKey: 'openingBalanceDate',
      header: 'Fecha saldo',
      cell: ({ getValue }) => <span className="tabular">{formatDate(getValue() as string)}</span>,
    },
    {
      accessorKey: 'status',
      header: 'Estado',
      cell: ({ getValue }) => (
        <StatusBadge status={getValue() === 'ACTIVE' ? 'USER_ACTIVE' : 'USER_DISABLED'} />
      ),
    },
    ...(canManage
      ? [
          {
            id: 'edit',
            header: '',
            enableSorting: false,
            cell: ({ row }) => (
              <Button
                variant="ghost"
                size="icon"
                aria-label={`Editar ${row.original.name}`}
                onClick={() => setEditing(row.original)}
              >
                <Pencil />
              </Button>
            ),
          } satisfies ColumnDef<BankAccount, unknown>,
        ]
      : []),
  ];

  const noPuc =
    glAccounts.data && !glAccounts.data.some((g) => g.code.startsWith('11') && g.acceptsMovement);

  return (
    <div className="space-y-6">
      <PageHeader
        title="Cuentas bancarias"
        description="El número se guarda cifrado y se muestra enmascarado. Ver el número completo queda en auditoría y se oculta a los 30 segundos."
        actions={
          canManage && (
            <Button onClick={() => setEditing('new')} disabled={!!noPuc}>
              <Plus aria-hidden /> Nueva cuenta
            </Button>
          )
        }
      />
      {noPuc && canManage ? (
        <EmptyState
          title="Primero configure el plan de cuentas"
          description="Cada cuenta bancaria se asocia a una cuenta contable del grupo 11 (Disponible) que acepte movimiento."
          action={
            <Button asChild variant="secondary">
              <Link to="/administration/chart-of-accounts">Ir al plan de cuentas</Link>
            </Button>
          }
        />
      ) : (
        <DataTable
          caption="Cuentas bancarias"
          columns={columns}
          data={accounts.data ?? []}
          isLoading={accounts.isPending}
          error={accounts.isError ? errorMessage(accounts.error) : null}
          onRetry={() => accounts.refetch()}
          empty={{
            title: 'Sin cuentas bancarias',
            description: 'Registre la primera cuenta para empezar a conciliar.',
          }}
        />
      )}
      {editing && (
        <BankAccountDialog
          account={editing === 'new' ? null : editing}
          onClose={() => setEditing(null)}
        />
      )}
    </div>
  );
}

const FormSchema = z.object({
  bankId: z.string().min(1, 'Seleccione un banco.'),
  name: z.string().trim().min(3, 'Escriba un nombre para la cuenta.'),
  accountNumber: z.string(),
  type: z.enum(['CORRIENTE', 'AHORROS']),
  currency: z.enum(['COP', 'USD']),
  glAccountId: z.string().min(1, 'Seleccione la cuenta contable (PUC).'),
  openingBalance: z
    .string()
    .refine((v) => parseLocalAmount(v) !== null, 'Importe inválido. Ej. 1.234.567,89'),
  openingBalanceDate: z.string().min(1, 'Indique la fecha del saldo inicial.'),
  status: z.enum(['ACTIVE', 'INACTIVE']),
});
type FormData = z.infer<typeof FormSchema>;

function BankAccountDialog({
  account,
  onClose,
}: {
  account: BankAccount | null;
  onClose: () => void;
}) {
  const banks = useBanks();
  const gl = useGlAccounts();
  const queryClient = useQueryClient();
  const key = useOrgKey('bank-accounts');
  const cashAccounts =
    gl.data?.filter((g) => g.code.startsWith('11') && g.acceptsMovement && g.status === 'ACTIVE') ??
    [];
  const form = useForm<FormData>({
    resolver: zodResolver(
      account
        ? FormSchema
        : FormSchema.superRefine((v, ctx) => {
            const r = CreateBankAccountRequest.shape.accountNumber.safeParse(v.accountNumber);
            if (!r.success)
              ctx.addIssue({
                code: 'custom',
                path: ['accountNumber'],
                message: r.error.issues[0]!.message,
              });
          }),
    ),
    defaultValues: {
      bankId: account?.bank.id ?? '',
      name: account?.name ?? '',
      accountNumber: '',
      type: account?.type ?? 'CORRIENTE',
      currency: account?.currency ?? 'COP',
      glAccountId: account?.glAccount.id ?? '',
      openingBalance: account ? toLocalAmountInput(account.openingBalance) : '0',
      openingBalanceDate: account?.openingBalanceDate ?? '',
      status: account?.status ?? 'ACTIVE',
    },
  });
  const save = useMutation({
    mutationFn: (d: FormData) => {
      const openingBalance = parseLocalAmount(d.openingBalance)!;
      return account
        ? api(`/api/bank-accounts/${account.id}`, {
            method: 'PATCH',
            body: {
              name: d.name,
              glAccountId: d.glAccountId,
              status: d.status,
              openingBalance,
              openingBalanceDate: d.openingBalanceDate,
            },
          })
        : api('/api/bank-accounts', {
            method: 'POST',
            body: { ...d, openingBalance, status: undefined },
          });
    },
    onSuccess: () => {
      toast.success(account ? 'Cuenta actualizada' : 'Cuenta registrada');
      queryClient.invalidateQueries({ queryKey: key });
      onClose();
    },
  });
  const { errors } = form.formState;

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent
        title={account ? `Editar ${account.name}` : 'Nueva cuenta bancaria'}
        className="max-w-xl"
      >
        <form
          className="grid gap-4 sm:grid-cols-2"
          noValidate
          onSubmit={form.handleSubmit((d) => save.mutate(d))}
        >
          {save.isError && (
            <div className="sm:col-span-2">
              <FormAlert>{errorMessage(save.error)}</FormAlert>
            </div>
          )}
          <Field label="Banco" error={errors.bankId?.message}>
            {(p) => (
              <NativeSelect
                {...p}
                className="w-full"
                disabled={!!account}
                {...form.register('bankId')}
              >
                <option value="">Seleccione…</option>
                {banks.data?.map((b) => (
                  <option key={b.id} value={b.id}>
                    {b.name}
                  </option>
                ))}
              </NativeSelect>
            )}
          </Field>
          <Field label="Nombre" error={errors.name?.message} hint="Ej. Corriente pagos proveedores">
            {(p) => <Input {...p} {...form.register('name')} />}
          </Field>
          {account ? (
            <Field label="Número de cuenta" hint="No se puede cambiar.">
              {(p) => <Input {...p} value={account.maskedNumber} disabled />}
            </Field>
          ) : (
            <Field
              label="Número de cuenta"
              error={errors.accountNumber?.message}
              hint="Se guarda cifrado."
            >
              {(p) => (
                <Input
                  {...p}
                  inputMode="numeric"
                  autoComplete="off"
                  {...form.register('accountNumber')}
                />
              )}
            </Field>
          )}
          <Field label="Tipo">
            {(p) => (
              <NativeSelect
                {...p}
                className="w-full"
                disabled={!!account}
                {...form.register('type')}
              >
                <option value="CORRIENTE">Corriente</option>
                <option value="AHORROS">Ahorros</option>
              </NativeSelect>
            )}
          </Field>
          <Field label="Moneda">
            {(p) => (
              <NativeSelect
                {...p}
                className="w-full"
                disabled={!!account}
                {...form.register('currency')}
              >
                <option value="COP">COP — Peso colombiano</option>
                <option value="USD">USD — Dólar</option>
              </NativeSelect>
            )}
          </Field>
          <Field
            label="Cuenta contable (PUC)"
            error={errors.glAccountId?.message}
            hint="Grupo 11 · que acepte movimiento"
          >
            {(p) => (
              <NativeSelect {...p} className="w-full" {...form.register('glAccountId')}>
                <option value="">Seleccione…</option>
                {cashAccounts.map((g) => (
                  <option key={g.id} value={g.id}>
                    {glLabel(g)}
                  </option>
                ))}
              </NativeSelect>
            )}
          </Field>
          <Field
            label="Saldo inicial"
            error={errors.openingBalance?.message}
            hint="Formato 1.234.567,89"
          >
            {(p) => (
              <Input
                {...p}
                inputMode="decimal"
                className="text-right tabular"
                {...form.register('openingBalance')}
              />
            )}
          </Field>
          <Field label="Fecha del saldo inicial" error={errors.openingBalanceDate?.message}>
            {(p) => <Input {...p} type="date" {...form.register('openingBalanceDate')} />}
          </Field>
          {account && (
            <Field label="Estado">
              {(p) => (
                <Controller
                  control={form.control}
                  name="status"
                  render={({ field }) => (
                    <NativeSelect {...p} className="w-full" {...field}>
                      <option value="ACTIVE">Activa</option>
                      <option value="INACTIVE">Inactiva</option>
                    </NativeSelect>
                  )}
                />
              )}
            </Field>
          )}
          <div className="flex justify-end gap-2 sm:col-span-2">
            <Button type="button" variant="secondary" onClick={onClose}>
              Cancelar
            </Button>
            <Button type="submit" disabled={save.isPending}>
              Guardar
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
