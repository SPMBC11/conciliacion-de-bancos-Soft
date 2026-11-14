import { z } from 'zod';
import { Amount } from './master-data.js';

export const LedgerSide = z.enum(['BANK', 'BOOK']);
export type LedgerSide = z.infer<typeof LedgerSide>;
export const SIDE_LABEL: Record<LedgerSide, string> = {
  BANK: 'Extracto bancario',
  BOOK: 'Auxiliar contable',
};

export const DATE_FORMAT_OPTIONS = [
  'DD/MM/YYYY',
  'DD-MM-YYYY',
  'DD/MM/YY',
  'YYYY-MM-DD',
  'YYYY/MM/DD',
  'YYYYMMDD',
  'MM/DD/YYYY',
] as const;

const col = z.number().int().min(0).max(200);

/** Configuración de una plantilla (debe coincidir con TemplateConfig de @finagent/parsers). */
export const TemplateConfigSchema = z
  .object({
    sheetIndex: z.number().int().min(0).default(0),
    headerRow: z.number().int().min(1).nullable(),
    startRow: z.number().int().min(1),
    columns: z.object({
      date: col,
      valueDate: col.optional(),
      description: col,
      reference: col.optional(),
      documentNumber: col.optional(),
      thirdParty: col.optional(),
      thirdPartyNit: col.optional(),
      debit: col.optional(),
      credit: col.optional(),
      amount: col.optional(),
      balance: col.optional(),
    }),
    amountMode: z.enum(['DEBIT_CREDIT', 'SIGNED']),
    signedPositiveIs: z.enum(['INFLOW', 'OUTFLOW']).optional(),
    dateFormat: z.enum(DATE_FORMAT_OPTIONS),
    decimalSeparator: z.enum([',', '.']),
    skipRowPatterns: z.array(z.string().max(200)).max(20).default([]),
  })
  .superRefine((t, ctx) => {
    if (
      t.amountMode === 'DEBIT_CREDIT' &&
      (t.columns.debit === undefined || t.columns.credit === undefined)
    ) {
      ctx.addIssue({
        code: 'custom',
        path: ['columns'],
        message: 'Indique las columnas de débito y crédito.',
      });
    }
    if (t.amountMode === 'SIGNED' && t.columns.amount === undefined) {
      ctx.addIssue({
        code: 'custom',
        path: ['columns'],
        message: 'Indique la columna de importe.',
      });
    }
    if (t.headerRow !== null && t.startRow <= t.headerRow) {
      ctx.addIssue({
        code: 'custom',
        path: ['startRow'],
        message: 'Los datos deben empezar después del encabezado.',
      });
    }
    for (const p of t.skipRowPatterns) {
      try {
        new RegExp(p, 'i');
      } catch {
        ctx.addIssue({
          code: 'custom',
          path: ['skipRowPatterns'],
          message: `Patrón inválido: ${p}`,
        });
      }
    }
  });
export type TemplateConfigInput = z.input<typeof TemplateConfigSchema>;

export const CreateTemplateRequest = z.object({
  name: z.string().trim().min(3).max(100),
  side: LedgerSide,
  bankId: z.uuid().optional(),
  software: z.string().trim().max(60).optional(),
  format: z.enum(['CSV', 'XLSX', 'XLS']),
  config: TemplateConfigSchema,
  /** Documento de referencia: de él se toma la firma del encabezado. */
  sampleDocumentId: z.uuid().optional(),
});

export const UpdateTemplateRequest = z.object({
  name: z.string().trim().min(3).max(100).optional(),
  config: TemplateConfigSchema.optional(),
  status: z.enum(['ACTIVE', 'INACTIVE']).optional(),
  sampleDocumentId: z.uuid().optional(),
});

export const UploadDocumentFields = z.object({
  bankAccountId: z.uuid('Seleccione la cuenta bancaria.'),
  side: LedgerSide,
  year: z.coerce.number().int().min(2000).max(2100),
  month: z.coerce.number().int().min(1).max(12),
});

export const PreviewRequest = z.object({
  templateId: z.uuid().optional(),
  /** Configuración en edición (aún no guardada) para la vista previa en vivo del mapeador. */
  templateConfig: TemplateConfigSchema.optional(),
  openingBalance: Amount.optional(),
  closingBalance: Amount.optional(),
});

export const ImportRequest = z.object({
  templateId: z.uuid().optional(),
  openingBalance: Amount.optional(),
  closingBalance: Amount.optional(),
  justification: z
    .string()
    .trim()
    .min(10, 'Explique por qué continúa (mínimo 10 caracteres).')
    .max(1000)
    .optional(),
});

export const DuplicateDecisionRequest = z.object({
  side: LedgerSide,
  decision: z.enum(['CONFIRMED', 'DISMISSED']),
});
