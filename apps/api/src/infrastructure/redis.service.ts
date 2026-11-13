import { Injectable, type OnModuleDestroy } from '@nestjs/common';
import { Redis } from 'ioredis';
import { config } from '../config.js';

/** Conexión compartida a Redis (BullMQ exige maxRetriesPerRequest: null). */
@Injectable()
export class RedisService implements OnModuleDestroy {
  readonly client = new Redis(config.REDIS_URL, { maxRetriesPerRequest: null, lazyConnect: false });

  async isUp(): Promise<boolean> {
    try {
      return (await this.client.ping()) === 'PONG';
    } catch {
      return false;
    }
  }

  async onModuleDestroy() {
    await this.client.quit();
  }
}
