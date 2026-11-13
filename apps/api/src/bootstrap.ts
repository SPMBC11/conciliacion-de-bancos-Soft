import type { INestApplication } from '@nestjs/common';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import helmet from 'helmet';
import { Logger } from 'nestjs-pino';
import { ApiExceptionFilter } from './common/api-exception.filter.js';
import { config } from './config.js';

/** Configuración común de la app HTTP (la usan main.ts y los tests de integración). */
export function configureApp(app: INestApplication) {
  app.useLogger(app.get(Logger));
  app.use(helmet());
  app.enableCors({ origin: config.WEB_ORIGIN, credentials: true });
  app.setGlobalPrefix('api');
  app.useGlobalFilters(new ApiExceptionFilter());
  app.enableShutdownHooks();

  if (config.NODE_ENV !== 'production') {
    const doc = new DocumentBuilder()
      .setTitle('FinAgent AI API')
      .setVersion(config.APP_VERSION)
      .build();
    SwaggerModule.setup('api/docs', app, () => SwaggerModule.createDocument(app, doc));
  }
  return app;
}
