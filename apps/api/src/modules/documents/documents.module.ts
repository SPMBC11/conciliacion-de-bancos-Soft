import { Module } from '@nestjs/common';
import { AuditService } from '../audit/audit.service.js';
import { DocumentsService } from './documents.service.js';

/** Núcleo de documentos sin controladores: lo comparten la API y el worker. */
@Module({ providers: [DocumentsService, AuditService], exports: [DocumentsService, AuditService] })
export class DocumentsCoreModule {}
