import { Injectable, Logger } from '@nestjs/common';
import nodemailer from 'nodemailer';
import { config } from '../config.js';

type Mail = { to: string; subject: string; text: string };

/** Correo saliente (Mailpit en desarrollo: http://localhost:8025). */
@Injectable()
export class MailService {
  private readonly logger = new Logger(MailService.name);
  private readonly transport = nodemailer.createTransport({
    host: config.SMTP_HOST,
    port: config.SMTP_PORT,
    secure: false,
  });

  async send({ to, subject, text }: Mail) {
    try {
      await this.transport.sendMail({ from: config.MAIL_FROM, to, subject, text });
    } catch (err) {
      // El enlace queda registrado como fallo; el usuario puede reenviar la invitación.
      this.logger.error(`No se pudo enviar el correo "${subject}": ${(err as Error).message}`);
      throw err;
    }
  }
}
