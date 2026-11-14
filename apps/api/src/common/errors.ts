import { HttpException } from '@nestjs/common';

/** Error de negocio con código estable y mensaje en español para el usuario. */
export class AppError extends HttpException {
  constructor(status: number, code: string, message: string, details?: unknown) {
    super({ code, message, ...(details !== undefined && { details }) }, status);
  }
}

export const Errors = {
  unauthorized: (message = 'Debe iniciar sesión.') => new AppError(401, 'UNAUTHORIZED', message),
  forbidden: (message = 'No tiene permiso para realizar esta acción.') =>
    new AppError(403, 'FORBIDDEN', message),
  notFound: (what = 'El recurso') => new AppError(404, 'NOT_FOUND', `${what} no existe.`),
  conflict: (code: string, message: string) => new AppError(409, code, message),
  badRequest: (code: string, message: string, details?: unknown) =>
    new AppError(400, code, message, details),
};
