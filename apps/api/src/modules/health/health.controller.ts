import { Controller, Get, HttpCode, Res } from '@nestjs/common';
import { ApiOkResponse, ApiTags } from '@nestjs/swagger';
import type { HealthResponse } from '@finagent/contracts';
import type { Response } from 'express';
import { config } from '../../config.js';
import { PrismaService } from '../../infrastructure/prisma.service.js';
import { RedisService } from '../../infrastructure/redis.service.js';
import { StorageService } from '../../infrastructure/storage.service.js';

const up = (ok: boolean) => (ok ? 'up' : 'down');

@ApiTags('health')
@Controller('health')
export class HealthController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly redis: RedisService,
    private readonly storage: StorageService,
  ) {}

  @Get()
  @HttpCode(200)
  @ApiOkResponse({ description: 'Estado de la API y sus dependencias' })
  async check(@Res({ passthrough: true }) res: Response): Promise<HealthResponse> {
    const [database, redis, storage] = await Promise.all([
      this.prisma.isUp(),
      this.redis.isUp(),
      this.storage.isUp(),
    ]);
    const allUp = database && redis && storage;
    if (!allUp) res.status(503);
    return {
      status: up(allUp),
      version: config.APP_VERSION,
      checks: { database: up(database), redis: up(redis), storage: up(storage) },
    };
  }
}
