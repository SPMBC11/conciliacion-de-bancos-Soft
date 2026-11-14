-- CreateEnum
CREATE TYPE "LedgerSide" AS ENUM ('BANK', 'BOOK');

-- CreateEnum
CREATE TYPE "DocumentStatus" AS ENUM ('UPLOADED', 'IMPORTING', 'IMPORTED', 'FAILED');

-- CreateEnum
CREATE TYPE "ImportStatus" AS ENUM ('QUEUED', 'PROCESSING', 'COMPLETED', 'FAILED');

-- CreateEnum
CREATE TYPE "RowStatus" AS ENUM ('OK', 'ERROR', 'SKIPPED');

-- CreateEnum
CREATE TYPE "DuplicateStatus" AS ENUM ('NONE', 'POSSIBLE', 'CONFIRMED', 'DISMISSED');

-- CreateTable
CREATE TABLE "import_templates" (
    "id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "side" "LedgerSide" NOT NULL,
    "bank_id" UUID,
    "software" TEXT,
    "format" TEXT NOT NULL,
    "current_version" INTEGER NOT NULL DEFAULT 1,
    "header_signature" TEXT,
    "status" "ActiveStatus" NOT NULL DEFAULT 'ACTIVE',
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL,
    "created_by" UUID,

    CONSTRAINT "import_templates_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "import_template_versions" (
    "id" UUID NOT NULL,
    "template_id" UUID NOT NULL,
    "version" INTEGER NOT NULL,
    "config" JSONB NOT NULL,
    "header_signature" TEXT,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_by" UUID,

    CONSTRAINT "import_template_versions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "documents" (
    "id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "bank_account_id" UUID NOT NULL,
    "period_id" UUID NOT NULL,
    "side" "LedgerSide" NOT NULL,
    "file_name" TEXT NOT NULL,
    "format" TEXT NOT NULL,
    "size_bytes" INTEGER NOT NULL,
    "sha256" CHAR(64) NOT NULL,
    "storage_key" TEXT NOT NULL,
    "status" "DocumentStatus" NOT NULL DEFAULT 'UPLOADED',
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "uploaded_by" UUID NOT NULL,

    CONSTRAINT "documents_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "document_imports" (
    "id" UUID NOT NULL,
    "document_id" UUID NOT NULL,
    "template_version_id" UUID,
    "idempotency_key" TEXT NOT NULL,
    "status" "ImportStatus" NOT NULL DEFAULT 'QUEUED',
    "progress" SMALLINT NOT NULL DEFAULT 0,
    "row_count" INTEGER NOT NULL DEFAULT 0,
    "imported_count" INTEGER NOT NULL DEFAULT 0,
    "skipped_count" INTEGER NOT NULL DEFAULT 0,
    "error_count" INTEGER NOT NULL DEFAULT 0,
    "duplicate_count" INTEGER NOT NULL DEFAULT 0,
    "opening_balance" DECIMAL(18,2),
    "closing_balance" DECIMAL(18,2),
    "inflows" DECIMAL(18,2),
    "outflows" DECIMAL(18,2),
    "balanced" BOOLEAN,
    "balance_difference" DECIMAL(18,2),
    "justification" TEXT,
    "warnings" JSONB NOT NULL DEFAULT '[]',
    "failure_reason" TEXT,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "started_at" TIMESTAMPTZ,
    "finished_at" TIMESTAMPTZ,
    "created_by" UUID NOT NULL,

    CONSTRAINT "document_imports_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "document_rows" (
    "id" UUID NOT NULL,
    "import_id" UUID NOT NULL,
    "row_number" INTEGER NOT NULL,
    "raw" JSONB NOT NULL,
    "normalized" JSONB,
    "status" "RowStatus" NOT NULL,
    "errors" JSONB NOT NULL DEFAULT '[]',

    CONSTRAINT "document_rows_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "bank_transactions" (
    "id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "bank_account_id" UUID NOT NULL,
    "period_id" UUID NOT NULL,
    "document_id" UUID NOT NULL,
    "document_row_id" UUID NOT NULL,
    "external_id" TEXT,
    "operation_date" DATE NOT NULL,
    "value_date" DATE,
    "description_original" TEXT NOT NULL,
    "description_normalized" TEXT NOT NULL,
    "reference" TEXT,
    "document_number" TEXT,
    "amount" DECIMAL(18,2) NOT NULL,
    "currency" CHAR(3) NOT NULL,
    "running_balance" DECIMAL(18,2),
    "content_fingerprint" CHAR(64) NOT NULL,
    "source_fingerprint" CHAR(64) NOT NULL,
    "duplicate_status" "DuplicateStatus" NOT NULL DEFAULT 'NONE',
    "duplicate_of_id" UUID,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "bank_transactions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "accounting_transactions" (
    "id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "bank_account_id" UUID NOT NULL,
    "period_id" UUID NOT NULL,
    "document_id" UUID NOT NULL,
    "document_row_id" UUID NOT NULL,
    "external_id" TEXT,
    "operation_date" DATE NOT NULL,
    "value_date" DATE,
    "description_original" TEXT NOT NULL,
    "description_normalized" TEXT NOT NULL,
    "reference" TEXT,
    "document_number" TEXT,
    "third_party" TEXT,
    "third_party_nit" TEXT,
    "amount" DECIMAL(18,2) NOT NULL,
    "currency" CHAR(3) NOT NULL,
    "running_balance" DECIMAL(18,2),
    "content_fingerprint" CHAR(64) NOT NULL,
    "source_fingerprint" CHAR(64) NOT NULL,
    "duplicate_status" "DuplicateStatus" NOT NULL DEFAULT 'NONE',
    "duplicate_of_id" UUID,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "accounting_transactions_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "import_templates_organization_id_side_header_signature_idx" ON "import_templates"("organization_id", "side", "header_signature");

-- CreateIndex
CREATE UNIQUE INDEX "import_templates_organization_id_name_key" ON "import_templates"("organization_id", "name");

-- CreateIndex
CREATE UNIQUE INDEX "import_template_versions_template_id_version_key" ON "import_template_versions"("template_id", "version");

-- CreateIndex
CREATE UNIQUE INDEX "documents_storage_key_key" ON "documents"("storage_key");

-- CreateIndex
CREATE INDEX "documents_organization_id_bank_account_id_period_id_idx" ON "documents"("organization_id", "bank_account_id", "period_id");

-- CreateIndex
CREATE UNIQUE INDEX "documents_organization_id_bank_account_id_side_sha256_key" ON "documents"("organization_id", "bank_account_id", "side", "sha256");

-- CreateIndex
CREATE UNIQUE INDEX "document_imports_idempotency_key_key" ON "document_imports"("idempotency_key");

-- CreateIndex
CREATE INDEX "document_imports_document_id_idx" ON "document_imports"("document_id");

-- CreateIndex
CREATE UNIQUE INDEX "document_rows_import_id_row_number_key" ON "document_rows"("import_id", "row_number");

-- CreateIndex
CREATE UNIQUE INDEX "bank_transactions_document_row_id_key" ON "bank_transactions"("document_row_id");

-- CreateIndex
CREATE UNIQUE INDEX "bank_transactions_source_fingerprint_key" ON "bank_transactions"("source_fingerprint");

-- CreateIndex
CREATE INDEX "bank_transactions_bank_account_id_operation_date_idx" ON "bank_transactions"("bank_account_id", "operation_date");

-- CreateIndex
CREATE INDEX "bank_transactions_bank_account_id_amount_idx" ON "bank_transactions"("bank_account_id", "amount");

-- CreateIndex
CREATE INDEX "bank_transactions_bank_account_id_content_fingerprint_idx" ON "bank_transactions"("bank_account_id", "content_fingerprint");

-- CreateIndex
CREATE INDEX "bank_transactions_organization_id_period_id_idx" ON "bank_transactions"("organization_id", "period_id");

-- CreateIndex
CREATE UNIQUE INDEX "accounting_transactions_document_row_id_key" ON "accounting_transactions"("document_row_id");

-- CreateIndex
CREATE UNIQUE INDEX "accounting_transactions_source_fingerprint_key" ON "accounting_transactions"("source_fingerprint");

-- CreateIndex
CREATE INDEX "accounting_transactions_bank_account_id_operation_date_idx" ON "accounting_transactions"("bank_account_id", "operation_date");

-- CreateIndex
CREATE INDEX "accounting_transactions_bank_account_id_amount_idx" ON "accounting_transactions"("bank_account_id", "amount");

-- CreateIndex
CREATE INDEX "accounting_transactions_bank_account_id_content_fingerprint_idx" ON "accounting_transactions"("bank_account_id", "content_fingerprint");

-- CreateIndex
CREATE INDEX "accounting_transactions_organization_id_period_id_idx" ON "accounting_transactions"("organization_id", "period_id");

-- AddForeignKey
ALTER TABLE "import_templates" ADD CONSTRAINT "import_templates_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "import_templates" ADD CONSTRAINT "import_templates_bank_id_fkey" FOREIGN KEY ("bank_id") REFERENCES "banks"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "import_template_versions" ADD CONSTRAINT "import_template_versions_template_id_fkey" FOREIGN KEY ("template_id") REFERENCES "import_templates"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "documents" ADD CONSTRAINT "documents_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "documents" ADD CONSTRAINT "documents_bank_account_id_fkey" FOREIGN KEY ("bank_account_id") REFERENCES "bank_accounts"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "documents" ADD CONSTRAINT "documents_period_id_fkey" FOREIGN KEY ("period_id") REFERENCES "accounting_periods"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "document_imports" ADD CONSTRAINT "document_imports_document_id_fkey" FOREIGN KEY ("document_id") REFERENCES "documents"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "document_imports" ADD CONSTRAINT "document_imports_template_version_id_fkey" FOREIGN KEY ("template_version_id") REFERENCES "import_template_versions"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "document_rows" ADD CONSTRAINT "document_rows_import_id_fkey" FOREIGN KEY ("import_id") REFERENCES "document_imports"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "bank_transactions" ADD CONSTRAINT "bank_transactions_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "bank_transactions" ADD CONSTRAINT "bank_transactions_bank_account_id_fkey" FOREIGN KEY ("bank_account_id") REFERENCES "bank_accounts"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "bank_transactions" ADD CONSTRAINT "bank_transactions_period_id_fkey" FOREIGN KEY ("period_id") REFERENCES "accounting_periods"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "bank_transactions" ADD CONSTRAINT "bank_transactions_document_id_fkey" FOREIGN KEY ("document_id") REFERENCES "documents"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "bank_transactions" ADD CONSTRAINT "bank_transactions_document_row_id_fkey" FOREIGN KEY ("document_row_id") REFERENCES "document_rows"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "accounting_transactions" ADD CONSTRAINT "accounting_transactions_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "accounting_transactions" ADD CONSTRAINT "accounting_transactions_bank_account_id_fkey" FOREIGN KEY ("bank_account_id") REFERENCES "bank_accounts"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "accounting_transactions" ADD CONSTRAINT "accounting_transactions_period_id_fkey" FOREIGN KEY ("period_id") REFERENCES "accounting_periods"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "accounting_transactions" ADD CONSTRAINT "accounting_transactions_document_id_fkey" FOREIGN KEY ("document_id") REFERENCES "documents"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "accounting_transactions" ADD CONSTRAINT "accounting_transactions_document_row_id_fkey" FOREIGN KEY ("document_row_id") REFERENCES "document_rows"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Una sola importación vigente (en cola, en proceso o completada) por documento.
CREATE UNIQUE INDEX "document_imports_one_active" ON "document_imports"("document_id")
  WHERE "status" IN ('QUEUED', 'PROCESSING', 'COMPLETED');

-- Movimientos importados: nunca se borran ni se cambian sus datos de origen.
CREATE FUNCTION transactions_immutable() RETURNS trigger AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION 'Los movimientos importados no se eliminan (%).', TG_TABLE_NAME;
  END IF;
  IF NEW.operation_date IS DISTINCT FROM OLD.operation_date OR NEW.amount IS DISTINCT FROM OLD.amount
     OR NEW.description_original IS DISTINCT FROM OLD.description_original OR NEW.reference IS DISTINCT FROM OLD.reference
     OR NEW.document_row_id IS DISTINCT FROM OLD.document_row_id OR NEW.source_fingerprint IS DISTINCT FROM OLD.source_fingerprint THEN
    RAISE EXCEPTION 'Los datos de origen de un movimiento no se modifican (%).', TG_TABLE_NAME;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER bank_transactions_immutable BEFORE UPDATE OR DELETE ON "bank_transactions"
  FOR EACH ROW EXECUTE FUNCTION transactions_immutable();
CREATE TRIGGER accounting_transactions_immutable BEFORE UPDATE OR DELETE ON "accounting_transactions"
  FOR EACH ROW EXECUTE FUNCTION transactions_immutable();

ALTER TABLE "bank_transactions" ADD CONSTRAINT "bank_transactions_amount_nonzero" CHECK ("amount" <> 0);
ALTER TABLE "accounting_transactions" ADD CONSTRAINT "accounting_transactions_amount_nonzero" CHECK ("amount" <> 0);
ALTER TABLE "document_imports" ADD CONSTRAINT "document_imports_progress_range" CHECK ("progress" BETWEEN 0 AND 100);
