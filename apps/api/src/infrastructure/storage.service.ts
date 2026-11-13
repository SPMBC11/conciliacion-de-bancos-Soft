import { Injectable, Logger, type OnModuleInit } from '@nestjs/common';
import { CreateBucketCommand, HeadBucketCommand, S3Client } from '@aws-sdk/client-s3';
import { config } from '../config.js';

/** Almacenamiento privado de documentos (S3 compatible). Nunca se expone una URL pública. */
@Injectable()
export class StorageService implements OnModuleInit {
  private readonly logger = new Logger(StorageService.name);
  readonly bucket = config.S3_BUCKET;
  readonly client = new S3Client({
    endpoint: config.S3_ENDPOINT,
    region: config.S3_REGION,
    forcePathStyle: true,
    credentials: { accessKeyId: config.S3_ACCESS_KEY, secretAccessKey: config.S3_SECRET_KEY },
  });

  async onModuleInit() {
    if (await this.isUp()) return;
    try {
      await this.client.send(new CreateBucketCommand({ Bucket: this.bucket }));
      this.logger.log(`Bucket privado creado: ${this.bucket}`);
    } catch (err) {
      this.logger.warn(`No se pudo verificar/crear el bucket: ${(err as Error).message}`);
    }
  }

  async isUp(): Promise<boolean> {
    try {
      await this.client.send(new HeadBucketCommand({ Bucket: this.bucket }));
      return true;
    } catch {
      return false;
    }
  }
}
