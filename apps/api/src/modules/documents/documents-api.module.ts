import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module.js';
import { DocumentsController } from './documents.controller.js';
import { DocumentsCoreModule } from './documents.module.js';
import { ImportsQueue } from './imports.queue.js';
import { TemplatesController } from './templates.controller.js';
import { TransactionsController } from './transactions.controller.js';

@Module({
  imports: [AuthModule, DocumentsCoreModule],
  controllers: [DocumentsController, TemplatesController, TransactionsController],
  providers: [ImportsQueue],
})
export class DocumentsApiModule {}
