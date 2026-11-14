import { expect, it } from 'vitest';
import { guessColumns, guessDecimal, guessHeaderRow, initialConfig } from './mapping';

const rows = [
  ['BANCO DEMO A - EXTRACTO', null, null],
  ['Fecha', 'Descripción', 'Referencia', 'Débito', 'Crédito', 'Saldo'],
  ['01/10/2026', 'Consignación', 'RC-1', null, '1.500.000,00', '16.750.000,75'],
];

it('adivina encabezado, columnas, fecha y separador decimal', () => {
  expect(guessHeaderRow(rows)).toBe(2);
  expect(guessColumns(rows[1]!)).toEqual({
    date: 0,
    description: 1,
    reference: 2,
    debit: 3,
    credit: 4,
    balance: 5,
  });
  expect(guessDecimal(['1,234.50'])).toBe('.');
  expect(initialConfig(rows)).toMatchObject({
    headerRow: 2,
    startRow: 3,
    amountMode: 'DEBIT_CREDIT',
    dateFormat: 'DD/MM/YYYY',
    decimalSeparator: ',',
  });
});

it('auxiliar contable con comprobante, tercero y NIT', () => {
  expect(
    guessColumns(['Fecha', 'Comprobante', 'Tercero', 'NIT', 'Detalle', 'Débito', 'Crédito']),
  ).toEqual({
    date: 0,
    documentNumber: 1,
    thirdParty: 2,
    thirdPartyNit: 3,
    description: 4,
    debit: 5,
    credit: 6,
  });
});
