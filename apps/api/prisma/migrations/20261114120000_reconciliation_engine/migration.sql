CREATE TYPE "MatchingRunStatus" AS ENUM ('COMPLETED', 'FAILED');
CREATE TYPE "MatchingRuleKind" AS ENUM ('EXACT', 'BUSINESS_DATE', 'GROUP_SUM', 'APPROXIMATE', 'FEE_CLASSIFICATION');
CREATE TYPE "MatchingResultStatus" AS ENUM ('EXACT', 'PROBABLE', 'AMBIGUOUS', 'AMOUNT_DIFFERENCE', 'DATE_DIFFERENCE', 'BANK_UNMATCHED', 'BOOK_UNMATCHED', 'POSSIBLE_DUPLICATE', 'BANK_FEE', 'CARRIED_FORWARD');
CREATE TYPE "ConfirmedMatchStatus" AS ENUM ('CONFIRMED', 'REVERSED');

CREATE TABLE "matching_rule_versions" (
  "id" UUID NOT NULL,
  "organization_id" UUID NOT NULL,
  "version" INTEGER NOT NULL,
  "date_tolerance_business_days" SMALLINT NOT NULL DEFAULT 3,
  "amount_tolerance" DECIMAL(18,2) NOT NULL DEFAULT 1000,
  "amount_tolerance_basis_points" SMALLINT NOT NULL DEFAULT 10,
  "max_group_size" SMALLINT NOT NULL DEFAULT 6,
  "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "created_by" UUID,
  CONSTRAINT "matching_rule_versions_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "matching_rule_versions_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "matching_rule_versions_date_tolerance_check" CHECK ("date_tolerance_business_days" BETWEEN 0 AND 30),
  CONSTRAINT "matching_rule_versions_amount_tolerance_check" CHECK ("amount_tolerance" >= 0),
  CONSTRAINT "matching_rule_versions_group_size_check" CHECK ("max_group_size" BETWEEN 2 AND 8),
  CONSTRAINT "matching_rule_versions_version_check" CHECK ("version" > 0),
  CONSTRAINT "matching_rule_versions_org_version_key" UNIQUE ("organization_id", "version")
);

CREATE TABLE "matching_runs" (
  "id" UUID NOT NULL,
  "organization_id" UUID NOT NULL,
  "bank_account_id" UUID NOT NULL,
  "period_id" UUID NOT NULL,
  "rule_version_id" UUID NOT NULL,
  "status" "MatchingRunStatus" NOT NULL DEFAULT 'COMPLETED',
  "input_fingerprint" CHAR(64) NOT NULL,
  "idempotency_key" TEXT NOT NULL,
  "bank_transaction_count" INTEGER NOT NULL DEFAULT 0,
  "book_transaction_count" INTEGER NOT NULL DEFAULT 0,
  "suggestion_count" INTEGER NOT NULL DEFAULT 0,
  "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "created_by" UUID NOT NULL,
  CONSTRAINT "matching_runs_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "matching_runs_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "matching_runs_bank_account_id_fkey" FOREIGN KEY ("bank_account_id") REFERENCES "bank_accounts"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "matching_runs_period_id_fkey" FOREIGN KEY ("period_id") REFERENCES "accounting_periods"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "matching_runs_rule_version_id_fkey" FOREIGN KEY ("rule_version_id") REFERENCES "matching_rule_versions"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "matching_runs_organization_id_idempotency_key_key" UNIQUE ("organization_id", "idempotency_key")
);

CREATE TABLE "matching_suggestions" (
  "id" UUID NOT NULL,
  "run_id" UUID NOT NULL,
  "rule" "MatchingRuleKind" NOT NULL,
  "status" "MatchingResultStatus" NOT NULL,
  "score" SMALLINT NOT NULL DEFAULT 0,
  "bank_transaction_ids" JSONB NOT NULL DEFAULT '[]'::jsonb,
  "accounting_transaction_ids" JSONB NOT NULL DEFAULT '[]'::jsonb,
  "amount_difference" DECIMAL(18,2) NOT NULL DEFAULT 0,
  "date_difference_days" INTEGER NOT NULL DEFAULT 0,
  "explanation" TEXT NOT NULL,
  "fee_type" TEXT,
  "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "matching_suggestions_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "matching_suggestions_run_id_fkey" FOREIGN KEY ("run_id") REFERENCES "matching_runs"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "matching_suggestions_score_check" CHECK ("score" BETWEEN 0 AND 100)
);

CREATE TABLE "confirmed_matches" (
  "id" UUID NOT NULL,
  "organization_id" UUID NOT NULL,
  "bank_account_id" UUID NOT NULL,
  "period_id" UUID NOT NULL,
  "run_id" UUID NOT NULL,
  "suggestion_id" UUID NOT NULL,
  "status" "ConfirmedMatchStatus" NOT NULL DEFAULT 'CONFIRMED',
  "confirmed_by" UUID NOT NULL,
  "confirmed_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "reversed_by" UUID,
  "reversed_at" TIMESTAMPTZ,
  "reversal_reason" TEXT,
  CONSTRAINT "confirmed_matches_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "confirmed_matches_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "confirmed_matches_bank_account_id_fkey" FOREIGN KEY ("bank_account_id") REFERENCES "bank_accounts"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "confirmed_matches_period_id_fkey" FOREIGN KEY ("period_id") REFERENCES "accounting_periods"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "confirmed_matches_run_id_fkey" FOREIGN KEY ("run_id") REFERENCES "matching_runs"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "confirmed_matches_suggestion_id_fkey" FOREIGN KEY ("suggestion_id") REFERENCES "matching_suggestions"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "confirmed_matches_reversal_fields_check" CHECK (("status" = 'CONFIRMED' AND "reversed_at" IS NULL AND "reversed_by" IS NULL) OR ("status" = 'REVERSED' AND "reversed_at" IS NOT NULL AND "reversed_by" IS NOT NULL AND length(trim(coalesce("reversal_reason", ''))) >= 3))
);

CREATE TABLE "confirmed_match_items" (
  "id" UUID NOT NULL,
  "confirmed_match_id" UUID NOT NULL,
  "side" "LedgerSide" NOT NULL,
  "bank_transaction_id" UUID,
  "accounting_transaction_id" UUID,
  "is_active" BOOLEAN NOT NULL DEFAULT true,
  CONSTRAINT "confirmed_match_items_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "confirmed_match_items_match_id_fkey" FOREIGN KEY ("confirmed_match_id") REFERENCES "confirmed_matches"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "confirmed_match_items_bank_transaction_id_fkey" FOREIGN KEY ("bank_transaction_id") REFERENCES "bank_transactions"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "confirmed_match_items_accounting_transaction_id_fkey" FOREIGN KEY ("accounting_transaction_id") REFERENCES "accounting_transactions"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "confirmed_match_items_side_id_check" CHECK (("side" = 'BANK' AND "bank_transaction_id" IS NOT NULL AND "accounting_transaction_id" IS NULL) OR ("side" = 'BOOK' AND "accounting_transaction_id" IS NOT NULL AND "bank_transaction_id" IS NULL))
);

CREATE INDEX "matching_runs_org_account_period_created_idx" ON "matching_runs"("organization_id", "bank_account_id", "period_id", "created_at");
CREATE INDEX "matching_suggestions_run_status_idx" ON "matching_suggestions"("run_id", "status");
CREATE INDEX "confirmed_match_items_match_idx" ON "confirmed_match_items"("confirmed_match_id");
CREATE UNIQUE INDEX "confirmed_match_items_active_bank_tx_key" ON "confirmed_match_items"("bank_transaction_id") WHERE "is_active" AND "bank_transaction_id" IS NOT NULL;
CREATE UNIQUE INDEX "confirmed_match_items_active_book_tx_key" ON "confirmed_match_items"("accounting_transaction_id") WHERE "is_active" AND "accounting_transaction_id" IS NOT NULL;
