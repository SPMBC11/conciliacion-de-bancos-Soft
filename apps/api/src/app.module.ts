import { randomUUID } from 'node:crypto';
import { Module } from '@nestjs/common';
import { LoggerModule } from 'nestjs-pino';
import { config } from './config.js';
import { InfrastructureModule } from './infrastructure/infrastructure.module.js';
import { HealthController } from './modules/health/health.controller.js';

@Module({
  imports: [
    LoggerModule.forRoot({
      pinoHttp: {
        level: config.LOG_LEVEL,
        // Correlation ID: se respeta el del cliente o se genera uno; se devuelve en la respuesta.
        genReqId: (req, res) => {
          const id = (req.headers['x-correlation-id'] as string | undefined) ?? randomUUID();
          res.setHeader('x-correlation-id', id);
          return id;
        },
        // Nunca registrar cookies ni encabezados de autorización.
        redact: ['req.headers.cookie', 'req.headers.authorization', 'res.headers["set-cookie"]'],
        ...(config.NODE_ENV === 'development' && { transport: { target: 'pino-pretty' } }),
      },
    }),
    InfrastructureModule,
  ],
  controllers: [HealthController],
})
export class AppModule {}
