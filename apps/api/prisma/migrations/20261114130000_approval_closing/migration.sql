DO $$ BEGIN
  CREATE TYPE "ReconciliationStatus" AS ENUM ('PREPARATION', 'SUBMITTED', 'REVIEWED', 'APPROVED', 'CLOSED');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
DO $$ BEGIN
  CREATE TYPE "AdjustmentStatus" AS ENUM ('DRAFT', 'APPROVED', 'EXPORTED', 'REVERSED');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

CREATE TABLE "reconciliations" (
  "id" UUID NOT NULL,
  "organization_id" UUID NOT NULL,
  "bank_account_id" UUID NOT NULL,
  "period_id" UUID NOT NULL,
  "status" "ReconciliationStatus" NOT NULL DEFAULT 'PREPARATION',
  "version" INTEGER NOT NULL DEFAULT 1,
  "prepared_by" UUID NOT NULL,
  "submitted_at" TIMESTAMPTZ,
  "reviewed_by" UUID,
  "reviewed_at" TIMESTAMPTZ,
  "approved_by" UUID,
  "approved_at" TIMESTAMPTZ,
  "closed_at" TIMESTAMPTZ,
  "snapshot" JSONB,
  "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ NOT NULL,
  CONSTRAINT "reconciliations_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "reconciliations_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "reconciliations_bank_account_id_fkey" FOREIGN KEY ("bank_account_id") REFERENCES "bank_accounts"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "reconciliations_period_id_fkey" FOREIGN KEY ("period_id") REFERENCES "accounting_periods"("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
CREATE UNIQUE INDEX "reconciliations_bank_account_id_period_id_key" ON "reconciliations"("bank_account_id", "period_id");
CREATE INDEX "reconciliations_organization_id_status_idx" ON "reconciliations"("organization_id", "status");

CREATE TABLE "adjustment_entries" (
  "id" UUID NOT NULL,
  "organization_id" UUID NOT NULL,
  "reconciliation_id" UUID NOT NULL,
  "status" "AdjustmentStatus" NOT NULL DEFAULT 'DRAFT',
  "entry_date" DATE NOT NULL,
  "description" TEXT NOT NULL,
  "currency" CHAR(3) NOT NULL,
  "reversal_of_id" UUID,
  "source_reconciling_item_ids" JSONB NOT NULL DEFAULT '[]',
  "created_by" UUID NOT NULL,
  "approved_by" UUID,
  "approved_at" TIMESTAMPTZ,
  "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "adjustment_entries_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "adjustment_entries_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "adjustment_entries_reconciliation_id_fkey" FOREIGN KEY ("reconciliation_id") REFERENCES "reconciliations"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "adjustment_entries_reversal_of_id_fkey" FOREIGN KEY ("reversal_of_id") REFERENCES "adjustment_entries"("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
CREATE INDEX "adjustment_entries_organization_id_reconciliation_id_status_idx" ON "adjustment_entries"("organization_id", "reconciliation_id", "status");

CREATE TABLE "adjustment_entry_lines" (
  "id" UUID NOT NULL,
  "adjustment_entry_id" UUID NOT NULL,
  "gl_account_id" UUID NOT NULL,
  "debit" DECIMAL(18,2) NOT NULL DEFAULT 0,
  "credit" DECIMAL(18,2) NOT NULL DEFAULT 0,
  "cost_center" TEXT,
  CONSTRAINT "adjustment_entry_lines_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "adjustment_entry_lines_debit_or_credit_check" CHECK (("debit" >= 0 AND "credit" = 0) OR ("credit" >= 0 AND "debit" = 0)),
  CONSTRAINT "adjustment_entry_lines_adjustment_entry_id_fkey" FOREIGN KEY ("adjustment_entry_id") REFERENCES "adjustment_entries"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "adjustment_entry_lines_gl_account_id_fkey" FOREIGN KEY ("gl_account_id") REFERENCES "chart_of_accounts"("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
CREATE INDEX "adjustment_entry_lines_adjustment_entry_id_idx" ON "adjustment_entry_lines"("adjustment_entry_id");
