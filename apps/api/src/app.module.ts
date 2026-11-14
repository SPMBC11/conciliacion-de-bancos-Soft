import { type MiddlewareConsumer, Module, type NestModule } from '@nestjs/common';
import { LoggerModule } from 'nestjs-pino';
import { config } from './config.js';
import { correlationIdOf, requestContextMiddleware } from './common/request-context.js';
import { AuthModule } from './modules/auth/auth.module.js';
import { DocumentsApiModule } from './modules/documents/documents-api.module.js';
import { MasterDataModule } from './modules/master-data/master-data.module.js';
import { InfrastructureModule } from './infrastructure/infrastructure.module.js';
import { HealthController } from './modules/health/health.controller.js';

@Module({
  imports: [
    LoggerModule.forRoot({
      pinoHttp: {
        level: config.LOG_LEVEL,
        // Correlation ID: se respeta el del cliente o se genera uno; se devuelve en la respuesta.
        genReqId: (req, res) => {
          const id = correlationIdOf(req as never);
          res.setHeader('x-correlation-id', id);
          return id;
        },
        // Nunca registrar cookies ni encabezados de autorización.
        redact: ['req.headers.cookie', 'req.headers.authorization', 'res.headers["set-cookie"]'],
        ...(config.NODE_ENV === 'development' && { transport: { target: 'pino-pretty' } }),
      },
    }),
    InfrastructureModule,
    AuthModule,
    MasterDataModule,
    DocumentsApiModule,
  ],
  controllers: [HealthController],
})
export class AppModule implements NestModule {
  configure(consumer: MiddlewareConsumer) {
    consumer.apply(requestContextMiddleware).forRoutes('*path');
  }
}
