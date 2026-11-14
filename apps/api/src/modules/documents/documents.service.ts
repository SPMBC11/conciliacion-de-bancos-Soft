import { randomUUID } from 'node:crypto';
import { Injectable, Logger } from '@nestjs/common';
import { type LedgerSide, TemplateConfigSchema } from '@finagent/contracts';
import {
  contentFingerprint,
  detectFormat,
  type FileFormat,
  headerSignature,
  readGrid,
  sha256Hex,
  sourceFingerprint,
  SUPPORTED_FORMATS,
  type TemplateConfig,
} from '@finagent/parsers';
import { Errors } from '../../common/errors.js';
import type { Prisma } from '../../generated/prisma/client.js';
import { PrismaService } from '../../infrastructure/prisma.service.js';
import { StorageService } from '../../infrastructure/storage.service.js';
import { AuditService } from '../audit/audit.service.js';
import { type ProcessedDocument, ProcessingError, processDocument } from './processor.js';

export const MAX_UPLOAD_BYTES = 20 * 1024 * 1024;
const CHUNK = 1000;

export type Warning = { code: string; message: string; blocking?: boolean };
export type Analysis = {
  warnings: Warning[];
  needsBalances: boolean;
  requiresJustification: boolean;
  /** rowNumber → id de un movimiento ya importado o número de fila anterior del mismo archivo. */
  duplicates: Map<number, { existingId?: string; firstRow?: number }>;
};

const MIME: Record<FileFormat, string> = {
  XLSX: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  XLS: 'application/vnd.ms-excel',
  CSV: 'text/csv',
  OFX: 'application/x-ofx',
  CAMT053: 'application/xml',
  PDF: 'application/pdf',
};

const iso = (d: Date) => d.toISOString().slice(0, 10);
/** 1 movimiento / 2 movimientos. */
const n = (count: number, one: string, many: string) =>
  `${count.toLocaleString('es-CO')} ${count === 1 ? one : many}`;
const money = (d: Prisma.Decimal | null) => (d === null ? null : d.toFixed(2));

@Injectable()
export class DocumentsService {
  private readonly logger = new Logger(DocumentsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly storage: StorageService,
    private readonly audit: AuditService,
  ) {}

  // ---------- Carga ----------

  async upload(p: {
    organizationId: string;
    userId: string;
    bankAccountId: string;
    side: LedgerSide;
    year: number;
    month: number;
    fileName: string;
    buffer: Uint8Array;
  }) {
    if (p.buffer.length === 0) throw Errors.badRequest('FILE_EMPTY', 'El archivo está vacío.');
    if (p.buffer.length > MAX_UPLOAD_BYTES)
      throw Errors.badRequest('FILE_TOO_LARGE', 'El archivo supera 20 MB.');
    const format = detectFormat(p.buffer, p.fileName);
    if (!format)
      throw Errors.badRequest(
        'FILE_TYPE_INVALID',
        'Formato no reconocido. Use XLSX, XLS, CSV, OFX o XML CAMT.053.',
      );
    if (!SUPPORTED_FORMATS.includes(format)) {
      throw Errors.badRequest(
        'FORMAT_NOT_SUPPORTED',
        'Los PDF aún no son compatibles en v1. Solicite al banco el extracto en Excel, CSV u OFX.',
      );
    }

    const account = await this.prisma.bankAccount.findFirst({
      where: { id: p.bankAccountId, organizationId: p.organizationId },
    });
    if (!account) throw Errors.notFound('La cuenta bancaria');
    if (account.status !== 'ACTIVE')
      throw Errors.badRequest('ACCOUNT_INACTIVE', 'La cuenta bancaria está inactiva.');
    const period = await this.prisma.accountingPeriod.findUnique({
      where: {
        organizationId_year_month: {
          organizationId: p.organizationId,
          year: p.year,
          month: p.month,
        },
      },
    });
    if (!period)
      throw Errors.badRequest(
        'PERIOD_NOT_OPEN',
        'Abra primero el periodo en Administración → Periodos.',
      );

    const sha256 = sha256Hex(p.buffer);
    const existing = await this.prisma.document.findUnique({
      where: {
        organizationId_bankAccountId_side_sha256: {
          organizationId: p.organizationId,
          bankAccountId: p.bankAccountId,
          side: p.side,
          sha256,
        },
      },
    });
    if (existing) {
      throw Errors.conflict(
        'DOCUMENT_DUPLICATE',
        `Este archivo ya fue cargado (${existing.fileName}). No se duplican registros.`,
      );
    }

    const id = randomUUID();
    const storageKey = `org/${p.organizationId}/documents/${id}`;
    await this.storage.putImmutable(storageKey, p.buffer, sha256, MIME[format]);
    const doc = await this.prisma.document.create({
      data: {
        id,
        organizationId: p.organizationId,
        bankAccountId: p.bankAccountId,
        periodId: period.id,
        side: p.side,
        fileName: p.fileName.slice(0, 255),
        format,
        sizeBytes: p.buffer.length,
        sha256,
        storageKey,
        uploadedBy: p.userId,
      },
    });
    await this.audit.record({
      action: 'DOCUMENT_UPLOADED',
      entity: 'document',
      entityId: doc.id,
      after: {
        fileName: doc.fileName,
        format,
        side: p.side,
        sha256,
        sizeBytes: doc.sizeBytes,
        period: `${p.year}-${p.month}`,
      },
    });
    return {
      document: doc,
      suggestedTemplate: await this.suggestTemplate(doc.organizationId, doc.side, format, p.buffer),
    };
  }

  /** Busca una plantilla cuyo encabezado coincida con alguna de las primeras filas del archivo. */
  async suggestTemplate(
    organizationId: string,
    side: LedgerSide,
    format: FileFormat,
    buf: Uint8Array,
  ) {
    if (format !== 'CSV' && format !== 'XLSX' && format !== 'XLS') return null;
    const sigs = new Set(
      readGrid(buf, format)
        .sheets.flatMap((s) => s.rows.slice(0, 30).map(headerSignature))
        .filter((s) => s.length > 0),
    );
    const candidates = await this.prisma.importTemplate.findMany({
      where: { organizationId, side, status: 'ACTIVE', headerSignature: { in: [...sigs] } },
      orderBy: { updatedAt: 'desc' },
      select: { id: true, name: true, currentVersion: true },
    });
    return candidates[0] ?? null;
  }

  async loadForOrg(organizationId: string, id: string) {
    const doc = await this.prisma.document.findFirst({
      where: { id, organizationId },
      include: { period: true, bankAccount: true },
    });
    if (!doc) throw Errors.notFound('El documento');
    return doc;
  }

  async file(doc: { storageKey: string; sha256: string }) {
    const buf = await this.storage.get(doc.storageKey);
    // Integridad: el original no debe haber cambiado desde la carga.
    if (sha256Hex(buf) !== doc.sha256)
      throw new Error('El archivo almacenado no coincide con su hash SHA-256.');
    return buf;
  }

  async resolveTemplate(organizationId: string, side: LedgerSide, templateId?: string) {
    if (!templateId) return null;
    const t = await this.prisma.importTemplate.findFirst({
      where: { id: templateId, organizationId },
      include: { versions: { orderBy: { version: 'desc' }, take: 1 } },
    });
    if (!t) throw Errors.notFound('La plantilla');
    if (t.side !== side)
      throw Errors.badRequest(
        'TEMPLATE_SIDE_MISMATCH',
        'La plantilla es de otro tipo de archivo (extracto/auxiliar).',
      );
    const version = t.versions[0]!;
    return {
      versionId: version.id,
      version: version.version,
      config: TemplateConfigSchema.parse(version.config) as TemplateConfig,
    };
  }

  // ---------- Análisis (vista previa e importación) ----------

  async analyze(
    doc: Awaited<ReturnType<DocumentsService['loadForOrg']>>,
    processed: ProcessedDocument,
  ): Promise<Analysis> {
    const warnings: Warning[] = [];
    const { balance, txs } = processed;
    const errorRows = processed.rows.filter((r) => r.status === 'ERROR').length;

    if (processed.currency && processed.currency !== doc.bankAccount.currency) {
      warnings.push({
        code: 'CURRENCY_MISMATCH',
        message: `El archivo está en ${processed.currency} y la cuenta en ${doc.bankAccount.currency}. No se comparan monedas distintas.`,
        blocking: true,
      });
    }
    if (txs.length === 0)
      warnings.push({
        code: 'NO_TRANSACTIONS',
        message: 'No se encontró ningún movimiento válido.',
        blocking: true,
      });
    if (errorRows)
      warnings.push({
        code: 'ROW_ERRORS',
        message: `${n(errorRows, 'fila no se pudo leer y no se importará', 'filas no se pudieron leer y no se importarán')}.`,
      });

    const needsBalances = balance.balanced === null;
    if (needsBalances) {
      warnings.push({
        code: 'BALANCES_REQUIRED',
        message: 'El archivo no trae saldos: indique el saldo inicial y final para validar.',
        blocking: true,
      });
    } else if (balance.balanced === false) {
      warnings.push({
        code: 'BALANCE_MISMATCH',
        message:
          balance.runningBalanceErrors.length && balance.difference === '0.00'
            ? `El saldo corrido no cuadra en ${n(balance.runningBalanceErrors.length, 'fila', 'filas')}.`
            : `Saldo inicial + movimientos − saldo final = ${balance.difference} (debe ser 0).`,
      });
    }

    const { year, month } = doc.period;
    const prefix = `${year}-${String(month).padStart(2, '0')}`;
    const outside = txs.filter((t) => !t.operationDate.startsWith(prefix)).length;
    if (outside)
      warnings.push({
        code: 'OUTSIDE_PERIOD',
        message: `${n(outside, 'movimiento tiene', 'movimientos tienen')} fecha fuera de ${prefix}.`,
      });

    // Saldo inicial vs saldo final de la importación anterior (misma cuenta y lado).
    const previous = await this.prisma.documentImport.findFirst({
      where: {
        status: 'COMPLETED',
        document: {
          bankAccountId: doc.bankAccountId,
          side: doc.side,
          period: { OR: [{ year: { lt: year } }, { year, month: { lt: month } }] },
        },
      },
      orderBy: [
        { document: { period: { year: 'desc' } } },
        { document: { period: { month: 'desc' } } },
      ],
    });
    if (
      balance.opening &&
      previous?.closingBalance &&
      !previous.closingBalance.equals(balance.opening)
    ) {
      warnings.push({
        code: 'OPENING_DIFFERS_FROM_PREVIOUS',
        message: `El saldo inicial (${balance.opening}) no coincide con el saldo final del periodo anterior (${money(previous.closingBalance)}).`,
      });
    }

    // Posibles duplicados: dentro del archivo y contra movimientos ya importados de la cuenta.
    const duplicates = new Map<number, { existingId?: string; firstRow?: number }>();
    const seen = new Map<string, number>();
    const fps = txs.map((t) => contentFingerprint(t));
    const existing = new Map<string, string>();
    for (let i = 0; i < fps.length; i += 5000) {
      const where = {
        bankAccountId: doc.bankAccountId,
        contentFingerprint: { in: fps.slice(i, i + 5000) },
      };
      const select = { id: true, contentFingerprint: true };
      const found =
        doc.side === 'BANK'
          ? await this.prisma.bankTransaction.findMany({ where, select })
          : await this.prisma.accountingTransaction.findMany({ where, select });
      found.forEach(
        (f) => existing.has(f.contentFingerprint) || existing.set(f.contentFingerprint, f.id),
      );
    }
    txs.forEach((t, i) => {
      const fp = fps[i]!;
      if (existing.has(fp)) duplicates.set(t.rowNumber, { existingId: existing.get(fp) });
      else if (seen.has(fp)) duplicates.set(t.rowNumber, { firstRow: seen.get(fp) });
      else seen.set(fp, t.rowNumber);
    });
    if (duplicates.size) {
      warnings.push({
        code: 'POSSIBLE_DUPLICATES',
        message: `${n(duplicates.size, 'movimiento parece duplicado', 'movimientos parecen duplicados')} (mismo día, importe, referencia y descripción). Se importan marcados para que usted decida; no se elimina ninguno.`,
      });
    }

    return {
      warnings,
      needsBalances,
      requiresJustification:
        balance.balanced === false ||
        warnings.some((w) => w.code === 'OPENING_DIFFERS_FROM_PREVIOUS'),
      duplicates,
    };
  }

  /** Lee y analiza un documento con la plantilla indicada (o la configuración en edición). */
  async run(
    doc: Awaited<ReturnType<DocumentsService['loadForOrg']>>,
    template: TemplateConfig | null,
    provided: { opening?: string | null; closing?: string | null },
  ) {
    const buf = await this.file(doc);
    let processed: ProcessedDocument;
    try {
      processed = processDocument(buf, doc.format as FileFormat, doc.side, template, provided);
    } catch (err) {
      if (err instanceof ProcessingError)
        throw Errors.badRequest('DOCUMENT_UNREADABLE', err.message);
      throw err;
    }
    return { processed, analysis: await this.analyze(doc, processed) };
  }

  summarize(processed: ProcessedDocument, analysis: Analysis) {
    const count = (s: string) => processed.rows.filter((r) => r.status === s).length;
    return {
      rowCount: processed.rows.length,
      validCount: count('OK'),
      errorCount: count('ERROR'),
      skippedCount: count('SKIPPED'),
      duplicateCount: analysis.duplicates.size,
      balance: processed.balance,
      currency: processed.currency,
      warnings: analysis.warnings,
      needsBalances: analysis.needsBalances,
      requiresJustification: analysis.requiresJustification,
      canImport: !analysis.warnings.some((w) => w.blocking),
      errors: processed.rows
        .filter((r) => r.status === 'ERROR')
        .slice(0, 100)
        .map((r) => ({ row: r.rowNumber, messages: r.errors })),
      sample: processed.rows.slice(0, 50).map((r) => ({
        row: r.rowNumber,
        status: r.status,
        errors: r.errors,
        tx: r.tx ?? null,
        duplicate: analysis.duplicates.has(r.rowNumber),
      })),
    };
  }

  // ---------- Importación (worker) ----------

  /**
   * Persiste filas y movimientos. Idempotente: solo procesa importaciones QUEUED de la organización indicada
   * (aislamiento también en el worker). Todo o nada dentro de una transacción.
   */
  async executeImport(
    importId: string,
    organizationId: string,
    reportProgress: (p: number) => Promise<void>,
  ) {
    const onProgress = async (p: number) => {
      const progress = Math.min(99, Math.max(0, Math.round(p)));
      await this.prisma.documentImport.update({ where: { id: importId }, data: { progress } });
      await reportProgress(progress);
    };
    const claimed = await this.prisma.documentImport.updateMany({
      where: { id: importId, status: 'QUEUED', document: { organizationId } },
      data: { status: 'PROCESSING', startedAt: new Date(), progress: 5 },
    });
    if (!claimed.count) return { skipped: true };

    const imp = await this.prisma.documentImport.findUniqueOrThrow({
      where: { id: importId },
      include: { templateVersion: true },
    });
    const doc = await this.loadForOrg(organizationId, imp.documentId);
    try {
      const template = imp.templateVersion
        ? (TemplateConfigSchema.parse(imp.templateVersion.config) as TemplateConfig)
        : null;
      const { processed, analysis } = await this.run(doc, template, {
        opening: money(imp.openingBalance),
        closing: money(imp.closingBalance),
      });
      if (analysis.warnings.some((w) => w.blocking))
        throw new Error(
          analysis.warnings
            .filter((w) => w.blocking)
            .map((w) => w.message)
            .join(' '),
        );
      if (analysis.requiresJustification && !imp.justification)
        throw new Error('Los saldos no cuadran y no se registró justificación.');
      await onProgress(20);

      const rowIds = new Map<number, string>();
      const rowData = processed.rows.map((r) => {
        const id = randomUUID();
        rowIds.set(r.rowNumber, id);
        return {
          id,
          importId,
          rowNumber: r.rowNumber,
          raw: r.raw as Prisma.InputJsonValue,
          normalized: (r.tx ?? undefined) as Prisma.InputJsonValue | undefined,
          status: r.status,
          errors: r.errors,
        };
      });
      const txIds = new Map<number, string>();
      const txData = processed.txs.map((t) => {
        const id = randomUUID();
        txIds.set(t.rowNumber, id);
        const fp = contentFingerprint(t);
        return {
          id,
          organizationId,
          bankAccountId: doc.bankAccountId,
          periodId: doc.periodId,
          documentId: doc.id,
          documentRowId: rowIds.get(t.rowNumber)!,
          externalId: t.externalId,
          operationDate: new Date(t.operationDate),
          valueDate: t.valueDate ? new Date(t.valueDate) : null,
          descriptionOriginal: t.descriptionOriginal,
          descriptionNormalized: t.descriptionNormalized,
          reference: t.reference,
          documentNumber: t.documentNumber,
          amount: t.amount,
          currency: doc.bankAccount.currency,
          runningBalance: t.balance,
          contentFingerprint: fp,
          sourceFingerprint: sourceFingerprint(fp, doc.id, t.rowNumber),
          ...(doc.side === 'BOOK' && { thirdParty: t.thirdParty, thirdPartyNit: t.thirdPartyNit }),
        };
      });
      // Duplicados: se marcan, nunca se eliminan. txData conserva el orden de processed.txs.
      txData.forEach((t, i) => {
        const dup = analysis.duplicates.get(processed.txs[i]!.rowNumber);
        if (dup)
          Object.assign(t, {
            duplicateStatus: 'POSSIBLE',
            duplicateOfId: dup.existingId ?? txIds.get(dup.firstRow!),
          });
      });

      await this.prisma.$transaction(
        async (tx) => {
          for (let i = 0; i < rowData.length; i += CHUNK) {
            await tx.documentRow.createMany({ data: rowData.slice(i, i + CHUNK) });
            await onProgress(20 + Math.floor((40 * (i + CHUNK)) / Math.max(rowData.length, 1)));
          }
          for (let i = 0; i < txData.length; i += CHUNK) {
            const chunk = txData.slice(i, i + CHUNK);
            if (doc.side === 'BANK')
              await tx.bankTransaction.createMany({
                data: chunk as Prisma.BankTransactionCreateManyInput[],
              });
            else
              await tx.accountingTransaction.createMany({
                data: chunk as Prisma.AccountingTransactionCreateManyInput[],
              });
            await onProgress(60 + Math.floor((35 * (i + CHUNK)) / Math.max(txData.length, 1)));
          }
          const s = this.summarize(processed, analysis);
          await tx.documentImport.update({
            where: { id: importId },
            data: {
              status: 'COMPLETED',
              progress: 100,
              finishedAt: new Date(),
              rowCount: s.rowCount,
              importedCount: txData.length,
              skippedCount: s.skippedCount,
              errorCount: s.errorCount,
              duplicateCount: s.duplicateCount,
              openingBalance: s.balance.opening,
              closingBalance: s.balance.closing,
              inflows: s.balance.inflows,
              outflows: s.balance.outflows,
              balanced: s.balance.balanced,
              balanceDifference: s.balance.difference,
              warnings: s.warnings,
            },
          });
          await tx.document.update({ where: { id: doc.id }, data: { status: 'IMPORTED' } });
          await this.audit.record(
            {
              action: 'DOCUMENT_IMPORTED',
              entity: 'document',
              entityId: doc.id,
              after: {
                importId,
                imported: txData.length,
                errors: s.errorCount,
                duplicates: s.duplicateCount,
                balanced: s.balance.balanced,
              },
              reason: imp.justification ?? undefined,
              actorId: imp.createdBy,
              organizationId,
            },
            tx,
          );
        },
        { timeout: 300_000, maxWait: 10_000 },
      );
      return { skipped: false };
    } catch (err) {
      const reason =
        err instanceof Error
          ? ((err as { response?: { message?: string } }).response?.message ?? err.message)
          : 'Error desconocido';
      this.logger.error(`Importación ${importId} falló: ${reason}`);
      await this.prisma.documentImport.update({
        where: { id: importId },
        data: { status: 'FAILED', failureReason: reason.slice(0, 1000), finishedAt: new Date() },
      });
      await this.prisma.document.update({ where: { id: doc.id }, data: { status: 'FAILED' } });
      await this.audit.record({
        action: 'DOCUMENT_IMPORT_FAILED',
        entity: 'document',
        entityId: doc.id,
        after: { importId, reason },
        actorId: imp.createdBy,
        organizationId,
      });
      return { skipped: false, failed: true };
    }
  }

  presentImport(
    i: {
      openingBalance: Prisma.Decimal | null;
      closingBalance: Prisma.Decimal | null;
      inflows: Prisma.Decimal | null;
      outflows: Prisma.Decimal | null;
      balanceDifference: Prisma.Decimal | null;
    } & Record<string, unknown>,
  ) {
    return {
      ...i,
      openingBalance: money(i.openingBalance),
      closingBalance: money(i.closingBalance),
      inflows: money(i.inflows),
      outflows: money(i.outflows),
      balanceDifference: money(i.balanceDifference),
    };
  }
}

export { iso, money };
