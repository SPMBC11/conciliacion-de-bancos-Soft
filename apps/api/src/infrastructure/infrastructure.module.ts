import { Global, Module } from '@nestjs/common';
import { CryptoService } from './crypto.service.js';
import { MailService } from './mail.service.js';
import { PrismaService } from './prisma.service.js';
import { RedisService } from './redis.service.js';
import { StorageService } from './storage.service.js';

@Global()
@Module({
  providers: [PrismaService, RedisService, StorageService, MailService, CryptoService],
  exports: [PrismaService, RedisService, StorageService, MailService, CryptoService],
})
export class InfrastructureModule {}
