import { z } from 'zod';

/** Bancos de Colombia precargados (las organizaciones pueden agregar otros). */
export const COLOMBIAN_BANKS = [
  'Bancolombia',
  'Davivienda',
  'BBVA Colombia',
  'Banco de Bogotá',
  'Banco de Occidente',
  'Banco Popular',
  'Banco AV Villas',
  'Banco Caja Social',
  'Itaú',
  'Scotiabank Colpatria',
  'Banco Agrario de Colombia',
  'Banco GNB Sudameris',
  'Banco Pichincha',
  'Bancoomeva',
  'Banco Falabella',
  'Banco Finandina',
  'Banco Serfinanza',
] as const;

export const CURRENCIES = ['COP', 'USD'] as const;
export const Currency = z.enum(CURRENCIES);

/** Tipos de nota bancaria que generan partidas y asientos de ajuste (sección 9). */
export const FEE_TYPES = {
  GMF: { label: 'GMF (4x1000)', side: 'DEBITO', suggested: '511595' },
  COMISION: { label: 'Comisiones bancarias', side: 'DEBITO', suggested: '530515' },
  IVA_COMISION: { label: 'IVA sobre comisiones', side: 'DEBITO', suggested: '530515' },
  CUOTA_MANEJO: { label: 'Cuota de manejo', side: 'DEBITO', suggested: '530505' },
  CHEQUERA: { label: 'Chequeras', side: 'DEBITO', suggested: '530505' },
  GASTO_BANCARIO: { label: 'Gastos bancarios varios', side: 'DEBITO', suggested: '530505' },
  INTERES: { label: 'Intereses / rendimientos', side: 'CREDITO', suggested: '421005' },
  RETEFUENTE: {
    label: 'Retención en la fuente sobre rendimientos',
    side: 'DEBITO',
    suggested: '135515',
  },
} as const;
export type FeeType = keyof typeof FEE_TYPES;
export const FEE_TYPE_KEYS = Object.keys(FEE_TYPES) as [FeeType, ...FeeType[]];

/** Importe en formato API: string decimal con punto y máximo 2 decimales. Nunca Number. */
export const Amount = z
  .string()
  .trim()
  .regex(/^-?\d{1,16}(\.\d{1,2})?$/, 'Importe inválido (ej. 1234567.89).');
export const IsoDate = z.iso.date('Fecha inválida.');

export const CreateBankAccountRequest = z.object({
  bankId: z.uuid('Seleccione un banco.'),
  name: z.string().trim().min(3, 'Escriba un nombre para la cuenta.').max(100),
  accountNumber: z
    .string()
    .trim()
    .transform((v) => v.replace(/[\s.-]/g, ''))
    .pipe(z.string().regex(/^\d{6,20}$/, 'Número de cuenta inválido (6 a 20 dígitos).')),
  type: z.enum(['CORRIENTE', 'AHORROS']),
  currency: Currency,
  glAccountId: z.uuid('Seleccione la cuenta contable (PUC).'),
  openingBalance: Amount,
  openingBalanceDate: IsoDate,
  openedAt: IsoDate.optional(),
});
export type CreateBankAccountRequest = z.input<typeof CreateBankAccountRequest>;

export const UpdateBankAccountRequest = z.object({
  name: z.string().trim().min(3).max(100).optional(),
  glAccountId: z.uuid().optional(),
  status: z.enum(['ACTIVE', 'INACTIVE']).optional(),
  openingBalance: Amount.optional(),
  openingBalanceDate: IsoDate.optional(),
});

export const UpsertGlAccountRequest = z.object({
  code: z
    .string()
    .trim()
    .regex(/^\d{1,12}$/, 'El código PUC solo lleva dígitos.'),
  name: z.string().trim().min(2).max(200),
  nature: z.enum(['DEBITO', 'CREDITO']).optional(),
  acceptsMovement: z.boolean().optional(),
  status: z.enum(['ACTIVE', 'INACTIVE']).optional(),
});

export const UpsertFeeMappingRequest = z.object({
  feeType: z.enum(FEE_TYPE_KEYS),
  glAccountId: z.uuid(),
});

export const CreateHolidayRequest = z.object({
  date: IsoDate,
  name: z.string().trim().min(3).max(100),
});

export const OpenPeriodRequest = z.object({
  year: z.number().int().min(2000).max(2100),
  month: z.number().int().min(1).max(12),
});

export const MemberAccountScopeRequest = z.object({
  scope: z.enum(['ALL', 'SELECTED']),
  bankAccountIds: z.array(z.uuid()).default([]),
});
