import { Injectable, type OnModuleDestroy } from '@nestjs/common';
import { Queue } from 'bullmq';
import { type ImportJob, QUEUES } from '../../infrastructure/queues.js';
import { RedisService } from '../../infrastructure/redis.service.js';

@Injectable()
export class ImportsQueue implements OnModuleDestroy {
  private readonly queue: Queue<ImportJob>;

  constructor(redis: RedisService) {
    this.queue = new Queue<ImportJob>(QUEUES.imports, { connection: redis.client });
  }

  enqueue(job: ImportJob) {
    // jobId = importId: encolar dos veces la misma importación no la duplica.
    return this.queue.add('import', job, {
      jobId: job.importId,
      attempts: 1,
      removeOnComplete: 1000,
      removeOnFail: 5000,
    });
  }

  async onModuleDestroy() {
    await this.queue.close();
  }
}
