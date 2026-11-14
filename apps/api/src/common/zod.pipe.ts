import { type PipeTransform } from '@nestjs/common';
import type { ZodType } from 'zod';
import { AppError } from './errors.js';

/** Valida y transforma el cuerpo/consulta con un esquema de @finagent/contracts. */
export class ZodPipe<T> implements PipeTransform<unknown, T> {
  constructor(private readonly schema: ZodType<T>) {}

  transform(value: unknown): T {
    const result = this.schema.safeParse(value);
    if (result.success) return result.data;
    const issues = result.error.issues.map((i) => ({ path: i.path.join('.'), message: i.message }));
    throw new AppError(400, 'VALIDATION_ERROR', issues[0]?.message ?? 'Datos inválidos.', issues);
  }
}
