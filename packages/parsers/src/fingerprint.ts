import { createHash } from 'node:crypto';
import type { NormalizedTx } from './template.js';

const sha = (s: string) => createHash('sha256').update(s).digest('hex');

/**
 * Huella de contenido (fecha + importe + referencia + descripción normalizada): detecta el mismo movimiento
 * en otro archivo (cargas solapadas) y líneas idénticas. No incluye la fila a propósito (riesgo R1 de la Fase 0).
 */
export const contentFingerprint = (
  t: Pick<NormalizedTx, 'operationDate' | 'amount' | 'reference' | 'descriptionNormalized'>,
) => sha([t.operationDate, t.amount, t.reference ?? '', t.descriptionNormalized].join('|'));

/**
 * Huella de origen (contenido + documento + fila): identifica la fila exacta para trazabilidad.
 * Usa el id del documento, no su hash: el mismo archivo puede cargarse legítimamente en otra cuenta u organización.
 */
export const sourceFingerprint = (content: string, documentId: string, rowNumber: number) =>
  sha(`${content}|${documentId}|${rowNumber}`);

export const sha256Hex = (buf: Uint8Array) => createHash('sha256').update(buf).digest('hex');
