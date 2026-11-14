import { Injectable } from '@nestjs/common';
import { createCipheriv, createDecipheriv, createHmac, hkdfSync, randomBytes } from 'node:crypto';
import { config } from '../config.js';

const KEY_VERSION = 'v1';

/**
 * Cifrado de datos sensibles en reposo (números de cuenta).
 * AES-256-GCM (confidencialidad + integridad). El prefijo de versión permite rotar la clave más adelante.
 * El HMAC usa una subclave derivada (HKDF), distinta de la de cifrado.
 */
@Injectable()
export class CryptoService {
  private readonly key = Buffer.from(config.ENCRYPTION_KEY, 'base64');
  private readonly hmacKey = Buffer.from(
    hkdfSync('sha256', this.key, Buffer.alloc(0), 'finagent:hmac:v1', 32),
  );

  encrypt(plain: string): string {
    const iv = randomBytes(12);
    const cipher = createCipheriv('aes-256-gcm', this.key, iv);
    const data = Buffer.concat([cipher.update(plain, 'utf8'), cipher.final()]);
    return [
      KEY_VERSION,
      iv.toString('base64'),
      cipher.getAuthTag().toString('base64'),
      data.toString('base64'),
    ].join(':');
  }

  decrypt(payload: string): string {
    const [version, iv, tag, data] = payload.split(':');
    if (version !== KEY_VERSION || !iv || !tag || !data)
      throw new Error('Formato de dato cifrado no reconocido.');
    const decipher = createDecipheriv('aes-256-gcm', this.key, Buffer.from(iv, 'base64'));
    decipher.setAuthTag(Buffer.from(tag, 'base64'));
    return Buffer.concat([decipher.update(Buffer.from(data, 'base64')), decipher.final()]).toString(
      'utf8',
    );
  }

  /** Huella determinista para búsquedas y unicidad sin descifrar. */
  hmac(value: string): string {
    return createHmac('sha256', this.hmacKey).update(value).digest('hex');
  }
}
