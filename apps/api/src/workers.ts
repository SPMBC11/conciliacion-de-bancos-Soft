import type { INestApplicationContext } from '@nestjs/common';
import { Logger } from '@nestjs/common';
import { Worker } from 'bullmq';
import { runWithContext } from './common/request-context.js';
import { type ImportJob, QUEUES } from './infrastructure/queues.js';
import { RedisService } from './infrastructure/redis.service.js';
import { DocumentsService } from './modules/documents/documents.service.js';

/** Registra los consumidores de colas. Lo usan worker.ts y las pruebas de integración. */
export function startWorkers(app: INestApplicationContext) {
  const logger = new Logger('Worker');
  const connection = app.get(RedisService).client;
  const documents = app.get(DocumentsService);

  const workers = [
    new Worker(QUEUES.system, async (job) => ({ pong: true, receivedAt: job.timestamp }), {
      connection,
    }),
    // Importaciones: el contexto lleva la organización y el usuario (auditoría y aislamiento en el worker).
    new Worker<ImportJob>(
      QUEUES.imports,
      (job) =>
        runWithContext(
          {
            correlationId: job.data.correlationId,
            source: 'WORKER',
            userId: job.data.userId,
            organizationId: job.data.organizationId,
          },
          () =>
            documents.executeImport(job.data.importId, job.data.organizationId, (p) =>
              job.updateProgress(p).then(() => undefined),
            ),
        ),
      { connection, concurrency: 2 },
    ),
  ];
  for (const w of workers) {
    w.on('failed', (job, err) =>
      logger.error(`Trabajo ${job?.id} falló en ${w.name}: ${err.message}`),
    );
  }
  logger.log(`Worker escuchando colas: ${workers.map((w) => w.name).join(', ')}`);
  return workers;
}
