import 'reflect-metadata';
import { Module } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { InfrastructureModule } from './infrastructure/infrastructure.module.js';
import { DocumentsCoreModule } from './modules/documents/documents.module.js';
import { startWorkers } from './workers.js';

/**
 * Proceso de trabajos en segundo plano (importación, motor, informes).
 * Comparte módulos con la API pero no expone HTTP.
 */
@Module({ imports: [InfrastructureModule, DocumentsCoreModule] })
class WorkerModule {}

const app = await NestFactory.createApplicationContext(WorkerModule);
app.enableShutdownHooks();
const workers = startWorkers(app);

const shutdown = async () => {
  await Promise.all(workers.map((w) => w.close()));
  await app.close();
  process.exit(0);
};
process.on('SIGTERM', shutdown);
process.on('SIGINT', shutdown);
