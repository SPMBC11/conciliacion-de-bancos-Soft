import {
  type ArgumentsHost,
  Catch,
  type ExceptionFilter,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import type { ApiError } from '@finagent/contracts';
import type { Request, Response } from 'express';

const DEFAULT_MESSAGES: Record<number, string> = {
  400: 'La solicitud no es válida.',
  401: 'Debe iniciar sesión.',
  403: 'No tiene permiso para realizar esta acción.',
  404: 'El recurso no existe.',
  409: 'El recurso fue modificado por otro usuario. Recargue e intente de nuevo.',
  429: 'Demasiadas solicitudes. Intente más tarde.',
  500: 'Ocurrió un error interno. Si persiste, informe el código de correlación.',
};

/** Todas las respuestas de error usan el mismo formato y un mensaje en español. */
@Catch()
export class ApiExceptionFilter implements ExceptionFilter {
  private readonly logger = new Logger('ApiError');

  catch(exception: unknown, host: ArgumentsHost) {
    const ctx = host.switchToHttp();
    const req = ctx.getRequest<Request & { id?: string }>();
    const res = ctx.getResponse<Response>();
    const status =
      exception instanceof HttpException ? exception.getStatus() : HttpStatus.INTERNAL_SERVER_ERROR;
    const payload = exception instanceof HttpException ? exception.getResponse() : undefined;
    const custom =
      typeof payload === 'object' && payload && 'code' in payload
        ? (payload as Partial<ApiError>)
        : undefined;

    if (status >= 500) this.logger.error(exception);

    const body: ApiError = {
      code: custom?.code ?? HttpStatus[status] ?? 'ERROR',
      message: custom?.message ?? DEFAULT_MESSAGES[status] ?? DEFAULT_MESSAGES[500]!,
      ...(custom?.details !== undefined && { details: custom.details }),
      correlationId: String(req.id ?? ''),
    };
    res.status(status).json(body);
  }
}
