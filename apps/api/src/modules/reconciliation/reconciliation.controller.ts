import {
  Body,
  Controller,
  Get,
  Headers,
  HttpCode,
  Param,
  ParseUUIDPipe,
  Post,
  Put,
  Query,
  Res,
} from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import type { Response } from 'express';
import * as XLSX from 'xlsx';
import {
  ConfirmMatchRequest,
  CreateAdjustmentRequest,
  CreateMatchingRunRequest,
  ManualMatchRequest,
  MatchingRulesRequest,
  ReverseMatchRequest,
  SuggestionsListQuery,
  SuggestionDecisionRequest,
  WorkflowReasonRequest,
  WorkbenchListQuery,
} from '@finagent/contracts';
import { z } from 'zod';
import { Errors } from '../../common/errors.js';
import { ZodPipe } from '../../common/zod.pipe.js';
import {
  type ActiveMembership,
  CurrentMembership,
  CurrentUser,
  Org,
  type AuthUser,
} from '../auth/decorators.js';
import { ReconciliationService } from './reconciliation.service.js';

const RunsQuery = z.object({ bankAccountId: z.uuid().optional(), periodId: z.uuid().optional() });
const CreateReconciliationRequest = z.object({ runId: z.uuid() });

@ApiTags('reconciliations')
@Controller('reconciliations')
export class ReconciliationController {
  constructor(private readonly reconciliation: ReconciliationService) {}

  @Get('reports/:runId')
  @Org('reconciliations.read')
  getReport(
    @CurrentMembership() m: ActiveMembership,
    @Param('runId', ParseUUIDPipe) runId: string,
  ) {
    return this.reconciliation.getReportData(m, runId);
  }

  @Get('reports/:runId/export')
  @Org('reconciliations.read')
  async exportReport(
    @CurrentMembership() m: ActiveMembership,
    @Param('runId', ParseUUIDPipe) runId: string,
    @Query('format') format: string,
    @Res({ passthrough: true }) response: Response,
  ) {
    if (format !== 'csv' && format !== 'xlsx')
      throw Errors.badRequest('INVALID_EXPORT_FORMAT', 'Use format=csv o format=xlsx.');
    const report = await this.reconciliation.getReportData(m, runId);
    const movements = [...report.bankTransactions, ...report.accountingTransactions].map((row) => ({
      Lado: row.side === 'BANK' ? 'Banco' : 'Contabilidad',
      Fecha: row.operationDate,
      Descripcion: safeSpreadsheetText(row.description),
      Referencia: safeSpreadsheetText(row.reference ?? ''),
      Comprobante: safeSpreadsheetText(row.documentNumber ?? ''),
      Importe: row.amount,
      Moneda: row.currency,
      Estado: row.matchStatus,
    }));
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(
      workbook,
      XLSX.utils.json_to_sheet([
        {
          Indicador: 'Cuenta',
          Valor: `${report.run.bankAccount.name} •••• ${report.run.bankAccount.accountLast4}`,
        },
        { Indicador: 'Periodo', Valor: `${report.run.period.month}/${report.run.period.year}` },
        { Indicador: 'Saldo neto banco', Valor: report.summary.bank.movementNet },
        { Indicador: 'Saldo neto libros', Valor: report.summary.book.movementNet },
        { Indicador: 'Diferencia neta', Valor: report.summary.movementDifference },
        { Indicador: 'Pendientes banco', Valor: report.summary.bank.pendingMovementCount },
        { Indicador: 'Pendientes libros', Valor: report.summary.book.pendingMovementCount },
        {
          Indicador: 'Estado',
          Valor: report.reconciliation?.status === 'CLOSED' ? 'CERRADA' : 'PRELIMINAR',
        },
        { Indicador: 'Generado', Valor: report.generatedAt },
      ]),
      'Resumen',
    );
    XLSX.utils.book_append_sheet(workbook, XLSX.utils.json_to_sheet(movements), 'Movimientos');
    XLSX.utils.book_append_sheet(
      workbook,
      XLSX.utils.json_to_sheet(report.matches),
      'Coincidencias',
    );
    XLSX.utils.book_append_sheet(workbook, XLSX.utils.json_to_sheet(report.adjustments), 'Ajustes');
    if (format === 'csv') {
      const csv = XLSX.utils.sheet_to_csv(workbook.Sheets.Movimientos!, { FS: ';' });
      response.setHeader('Content-Type', 'text/csv; charset=utf-8');
      response.setHeader('Content-Disposition', `attachment; filename="conciliacion-${runId}.csv"`);
      return Buffer.from(`\uFEFF${csv}`, 'utf8');
    }
    response.setHeader(
      'Content-Type',
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    );
    response.setHeader('Content-Disposition', `attachment; filename="conciliacion-${runId}.xlsx"`);
    return Buffer.from(XLSX.write(workbook, { type: 'buffer', bookType: 'xlsx' }));
  }

  @Get('records')
  @Org('reconciliations.read')
  listReconciliations(@CurrentMembership() m: ActiveMembership) {
    return this.reconciliation.listReconciliations(m);
  }

  @Post('records')
  @Org('reconciliations.prepare')
  @HttpCode(201)
  createReconciliation(
    @CurrentMembership() m: ActiveMembership,
    @CurrentUser() user: AuthUser,
    @Body(new ZodPipe(CreateReconciliationRequest))
    body: z.infer<typeof CreateReconciliationRequest>,
  ) {
    return this.reconciliation.createReconciliation(m, user, body.runId);
  }

  @Post('adjustments')
  @Org('reconciliations.prepare')
  @HttpCode(201)
  createAdjustment(
    @CurrentMembership() m: ActiveMembership,
    @CurrentUser() user: AuthUser,
    @Body(new ZodPipe(CreateAdjustmentRequest)) body: z.infer<typeof CreateAdjustmentRequest>,
  ) {
    return this.reconciliation.createAdjustment(m, user, body);
  }

  @Post('adjustments/:id/approve')
  @Org('reconciliations.prepare')
  @HttpCode(200)
  approveAdjustment(
    @CurrentMembership() m: ActiveMembership,
    @CurrentUser() user: AuthUser,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.reconciliation.approveAdjustment(m, user, id);
  }

  @Post('records/:id/:action')
  @Org('reconciliations.prepare')
  @HttpCode(200)
  transitionReconciliation(
    @CurrentMembership() m: ActiveMembership,
    @CurrentUser() user: AuthUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Param('action') action: 'submit' | 'review' | 'approve' | 'close',
    @Body(new ZodPipe(WorkflowReasonRequest)) body: z.infer<typeof WorkflowReasonRequest>,
  ) {
    if (!['submit', 'review', 'approve', 'close'].includes(action))
      throw Errors.notFound('La acción');
    return this.reconciliation.transitionReconciliation(m, user, id, action, body.reason);
  }

  @Get('rules')
  @Org('rules.manage')
  getRules(@CurrentMembership() m: ActiveMembership) {
    return this.reconciliation.getRules(m.organizationId);
  }

  @Put('rules')
  @Org('rules.manage')
  @HttpCode(200)
  updateRules(
    @CurrentMembership() m: ActiveMembership,
    @CurrentUser() user: AuthUser,
    @Body(new ZodPipe(MatchingRulesRequest)) body: z.infer<typeof MatchingRulesRequest>,
  ) {
    return this.reconciliation.updateRules(m, user, body);
  }

  @Get('runs')
  @Org('reconciliations.read')
  listRuns(
    @CurrentMembership() m: ActiveMembership,
    @Query(new ZodPipe(RunsQuery)) q: z.infer<typeof RunsQuery>,
  ) {
    return this.reconciliation.listRuns(m, q.bankAccountId, q.periodId);
  }

  @Post('runs')
  @Org('reconciliations.prepare')
  createRun(
    @CurrentMembership() m: ActiveMembership,
    @CurrentUser() user: AuthUser,
    @Headers('idempotency-key') idempotencyKey: string | undefined,
    @Body(new ZodPipe(CreateMatchingRunRequest)) body: z.infer<typeof CreateMatchingRunRequest>,
  ) {
    if (!idempotencyKey || idempotencyKey.length < 8 || idempotencyKey.length > 128)
      throw Errors.badRequest(
        'IDEMPOTENCY_KEY_REQUIRED',
        'Envíe Idempotency-Key (8–128 caracteres).',
      );
    return this.reconciliation.createRun(
      m,
      user,
      body.bankAccountId,
      body.periodId,
      idempotencyKey,
    );
  }

  @Get('runs/:id')
  @Org('reconciliations.read')
  getRun(@CurrentMembership() m: ActiveMembership, @Param('id', ParseUUIDPipe) id: string) {
    return this.reconciliation.getRun(m, id);
  }

  @Get('runs/:id/suggestions')
  @Org('reconciliations.read')
  listSuggestions(
    @CurrentMembership() m: ActiveMembership,
    @Param('id', ParseUUIDPipe) id: string,
    @Query(new ZodPipe(SuggestionsListQuery)) q: z.infer<typeof SuggestionsListQuery>,
  ) {
    return this.reconciliation.listSuggestions(m, id, q);
  }

  @Get('runs/:id/transactions')
  @Org('reconciliations.read')
  listWorkbenchTransactions(
    @CurrentMembership() m: ActiveMembership,
    @Param('id', ParseUUIDPipe) id: string,
    @Query(new ZodPipe(WorkbenchListQuery)) q: z.infer<typeof WorkbenchListQuery>,
  ) {
    return this.reconciliation.listWorkbenchTransactions(m, id, q);
  }

  @Get('runs/:id/matches')
  @Org('reconciliations.read')
  listConfirmedMatches(
    @CurrentMembership() m: ActiveMembership,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.reconciliation.listConfirmedMatches(m, id);
  }

  @Get('runs/:id/summary')
  @Org('reconciliations.read')
  getRunSummary(@CurrentMembership() m: ActiveMembership, @Param('id', ParseUUIDPipe) id: string) {
    return this.reconciliation.getRunSummary(m, id);
  }

  @Post('suggestions/:id/confirm')
  @Org('reconciliations.prepare')
  @HttpCode(200)
  confirmSuggestion(
    @CurrentMembership() m: ActiveMembership,
    @CurrentUser() user: AuthUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body(new ZodPipe(ConfirmMatchRequest)) body: z.infer<typeof ConfirmMatchRequest>,
  ) {
    return this.reconciliation.confirmSuggestion(m, user, id, body.reason);
  }

  @Post('suggestions/:id/reject')
  @Org('reconciliations.prepare')
  @HttpCode(200)
  rejectSuggestion(
    @CurrentMembership() m: ActiveMembership,
    @CurrentUser() user: AuthUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body(new ZodPipe(SuggestionDecisionRequest)) body: z.infer<typeof SuggestionDecisionRequest>,
  ) {
    return this.reconciliation.decideSuggestion(m, user, id, 'REJECTED', body.reason);
  }

  @Post('suggestions/:id/request-review')
  @Org('reconciliations.prepare')
  @HttpCode(200)
  requestReview(
    @CurrentMembership() m: ActiveMembership,
    @CurrentUser() user: AuthUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body(new ZodPipe(SuggestionDecisionRequest)) body: z.infer<typeof SuggestionDecisionRequest>,
  ) {
    return this.reconciliation.decideSuggestion(m, user, id, 'REQUIRES_REVIEW', body.reason);
  }

  @Post('matches/manual')
  @Org('reconciliations.prepare')
  @HttpCode(201)
  createManualMatch(
    @CurrentMembership() m: ActiveMembership,
    @CurrentUser() user: AuthUser,
    @Body(new ZodPipe(ManualMatchRequest)) body: z.infer<typeof ManualMatchRequest>,
  ) {
    return this.reconciliation.createManualMatch(
      m,
      user,
      body.runId,
      body.bankTransactionIds,
      body.accountingTransactionIds,
      body.reason,
    );
  }

  @Post('matches/:id/reverse')
  @Org('reconciliations.prepare')
  @HttpCode(200)
  reverseMatch(
    @CurrentMembership() m: ActiveMembership,
    @CurrentUser() user: AuthUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body(new ZodPipe(ReverseMatchRequest)) body: z.infer<typeof ReverseMatchRequest>,
  ) {
    return this.reconciliation.reverseMatch(m, user, id, body.reason);
  }
}

function safeSpreadsheetText(value: string) {
  return /^[=+@\-\t\r]/.test(value) ? `'${value}` : value;
}
