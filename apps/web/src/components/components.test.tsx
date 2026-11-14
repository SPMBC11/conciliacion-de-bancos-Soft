import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { ColumnDef } from '@tanstack/react-table';
import { describe, expect, it, vi } from 'vitest';
import { ConfirmationDialog } from './ConfirmationDialog';
import { DataTable } from './DataTable';
import { MoneyCell } from './MoneyCell';
import { STATUSES, type StatusKey, StatusBadge } from './StatusBadge';

describe('StatusBadge', () => {
  it.each(Object.keys(STATUSES) as StatusKey[])('%s se comunica con texto, no solo color', (s) => {
    render(<StatusBadge status={s} />);
    expect(screen.getByText(STATUSES[s].label)).toBeInTheDocument();
  });
});

describe('MoneyCell', () => {
  it('alinea a la derecha con cifras tabulares y marca negativos con signo y color', () => {
    render(<MoneyCell amount="-4000.00" />);
    const el = screen.getByText('−$ 4.000,00');
    expect(el).toHaveClass('text-right', 'tabular', 'text-danger-text');
  });
});

type Row = { name: string; amount: string };
const columns: ColumnDef<Row, unknown>[] = [
  { accessorKey: 'name', header: 'Nombre' },
  { accessorKey: 'amount', header: 'Importe', meta: { align: 'right' } },
];

describe('DataTable', () => {
  it('muestra el estado vacío configurado', () => {
    render(
      <DataTable caption="t" columns={columns} data={[]} empty={{ title: 'Nada por aquí' }} />,
    );
    expect(screen.getByText('Nada por aquí')).toBeInTheDocument();
  });

  it('filtra con la búsqueda e informa cuando no hay resultados', async () => {
    const user = userEvent.setup();
    const data = [
      { name: 'GMF', amount: '-6000.00' },
      { name: 'Intereses', amount: '100.00' },
    ];
    render(<DataTable caption="t" columns={columns} data={data} />);
    const search = screen.getByRole('searchbox', { name: 'Buscar en la tabla' });
    await user.type(search, 'inter');
    expect(screen.queryByText('GMF')).not.toBeInTheDocument();
    expect(screen.getByText('Intereses')).toBeInTheDocument();
    await user.clear(search);
    await user.type(search, 'zzz');
    expect(screen.getByText('Sin resultados')).toBeInTheDocument();
  });

  it('muestra error con opción de reintentar', async () => {
    const onRetry = vi.fn();
    render(
      <DataTable
        caption="t"
        columns={columns}
        data={[]}
        error="Tiempo agotado"
        onRetry={onRetry}
      />,
    );
    await userEvent.click(screen.getByRole('button', { name: 'Reintentar' }));
    expect(onRetry).toHaveBeenCalled();
  });
});

describe('ConfirmationDialog', () => {
  it('exige motivo antes de confirmar y lo entrega', async () => {
    const user = userEvent.setup();
    const onConfirm = vi.fn();
    render(
      <ConfirmationDialog
        open
        onOpenChange={() => {}}
        title="¿Deshacer?"
        description="d"
        confirmLabel="Deshacer"
        requireReason
        onConfirm={onConfirm}
      />,
    );
    const confirm = screen.getByRole('button', { name: 'Deshacer' });
    expect(confirm).toBeDisabled();
    await user.type(screen.getByLabelText(/Motivo/), 'Referencia equivocada');
    await user.click(confirm);
    expect(onConfirm).toHaveBeenCalledWith('Referencia equivocada');
  });
});
