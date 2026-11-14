import { Injectable, Logger, type OnModuleInit } from '@nestjs/common';
import {
  CreateBucketCommand,
  GetObjectCommand,
  HeadBucketCommand,
  HeadObjectCommand,
  PutObjectCommand,
  S3Client,
} from '@aws-sdk/client-s3';
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

  /**
   * Guarda un original. Nunca sobrescribe: si la clave ya existe, falla (los documentos son inmutables).
   * El servidor S3 cifra en reposo cuando lo soporta (SSE); el hash SHA-256 queda como metadato.
   */
  async putImmutable(key: string, body: Uint8Array, sha256: string, contentType: string) {
    const exists = await this.client
      .send(new HeadObjectCommand({ Bucket: this.bucket, Key: key }))
      .then(
        () => true,
        () => false,
      );
    if (exists) throw new Error(`El objeto ${key} ya existe: los documentos son inmutables.`);
    await this.client.send(
      new PutObjectCommand({
        Bucket: this.bucket,
        Key: key,
        Body: body,
        ContentType: contentType,
        Metadata: { sha256 },
      }),
    );
  }

  async get(key: string): Promise<Uint8Array> {
    const res = await this.client.send(new GetObjectCommand({ Bucket: this.bucket, Key: key }));
    return res.Body!.transformToByteArray();
  }
}
