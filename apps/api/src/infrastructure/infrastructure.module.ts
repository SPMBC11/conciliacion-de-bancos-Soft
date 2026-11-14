import { Global, Module } from '@nestjs/common';
import { MailService } from './mail.service.js';
import { PrismaService } from './prisma.service.js';
import { RedisService } from './redis.service.js';
import { StorageService } from './storage.service.js';

@Global()
@Module({
  providers: [PrismaService, RedisService, StorageService, MailService],
  exports: [PrismaService, RedisService, StorageService, MailService],
})
export class InfrastructureModule {}
