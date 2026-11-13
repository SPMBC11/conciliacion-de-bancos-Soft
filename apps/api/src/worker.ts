import 'reflect-metadata';
import { Logger, Module } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { Worker } from 'bullmq';
import { InfrastructureModule } from './infrastructure/infrastructure.module.js';
import { QUEUES } from './infrastructure/queues.js';
import { RedisService } from './infrastructure/redis.service.js';

/**
 * Proceso de trabajos en segundo plano (importación, motor, informes).
 * Comparte módulos con la API pero no expone HTTP.
 */
@Module({ imports: [InfrastructureModule] })
class WorkerModule {}

const app = await NestFactory.createApplicationContext(WorkerModule);
app.enableShutdownHooks();
const logger = new Logger('Worker');
const connection = app.get(RedisService).client;

const workers = [
  new Worker(QUEUES.system, async (job) => ({ pong: true, receivedAt: job.timestamp }), {
    connection,
  }),
];

for (const w of workers) {
  w.on('failed', (job, err) =>
    logger.error(`Trabajo ${job?.id} falló en ${w.name}: ${err.message}`),
  );
}
logger.log(`Worker escuchando colas: ${workers.map((w) => w.name).join(', ')}`);

const shutdown = async () => {
  await Promise.all(workers.map((w) => w.close()));
  await app.close();
  process.exit(0);
};
process.on('SIGTERM', shutdown);
process.on('SIGINT', shutdown);
