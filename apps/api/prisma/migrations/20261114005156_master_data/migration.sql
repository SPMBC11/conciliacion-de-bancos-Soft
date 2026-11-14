-- CreateEnum
CREATE TYPE "AccountScope" AS ENUM ('ALL', 'SELECTED');

-- CreateEnum
CREATE TYPE "BankAccountType" AS ENUM ('CORRIENTE', 'AHORROS');

-- CreateEnum
CREATE TYPE "ActiveStatus" AS ENUM ('ACTIVE', 'INACTIVE');

-- CreateEnum
CREATE TYPE "GlNature" AS ENUM ('DEBITO', 'CREDITO');

-- AlterTable
ALTER TABLE "organization_members" ADD COLUMN     "account_scope" "AccountScope" NOT NULL DEFAULT 'ALL';

-- CreateTable
CREATE TABLE "banks" (
    "id" UUID NOT NULL,
    "organization_id" UUID,
    "name" TEXT NOT NULL,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "banks_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "bank_accounts" (
    "id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "bank_id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "account_number_enc" TEXT NOT NULL,
    "account_number_hmac" TEXT NOT NULL,
    "account_last4" VARCHAR(4) NOT NULL,
    "type" "BankAccountType" NOT NULL,
    "currency" CHAR(3) NOT NULL,
    "gl_account_id" UUID NOT NULL,
    "opening_balance" DECIMAL(18,2) NOT NULL,
    "opening_balance_date" DATE NOT NULL,
    "opened_at" DATE,
    "status" "ActiveStatus" NOT NULL DEFAULT 'ACTIVE',
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL,
    "created_by" UUID,

    CONSTRAINT "bank_accounts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "member_bank_accounts" (
    "member_id" UUID NOT NULL,
    "bank_account_id" UUID NOT NULL,

    CONSTRAINT "member_bank_accounts_pkey" PRIMARY KEY ("member_id","bank_account_id")
);

-- CreateTable
CREATE TABLE "chart_of_accounts" (
    "id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "code" VARCHAR(12) NOT NULL,
    "name" TEXT NOT NULL,
    "nature" "GlNature" NOT NULL,
    "level" SMALLINT NOT NULL,
    "accepts_movement" BOOLEAN NOT NULL,
    "status" "ActiveStatus" NOT NULL DEFAULT 'ACTIVE',
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL,
    "created_by" UUID,

    CONSTRAINT "chart_of_accounts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "fee_type_account_mappings" (
    "id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "fee_type" TEXT NOT NULL,
    "gl_account_id" UUID NOT NULL,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL,
    "created_by" UUID,

    CONSTRAINT "fee_type_account_mappings_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "accounting_periods" (
    "id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "year" SMALLINT NOT NULL,
    "month" SMALLINT NOT NULL,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_by" UUID,

    CONSTRAINT "accounting_periods_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "holidays" (
    "id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "date" DATE NOT NULL,
    "name" TEXT NOT NULL,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_by" UUID,

    CONSTRAINT "holidays_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "banks_organization_id_name_key" ON "banks"("organization_id", "name");

-- CreateIndex
CREATE INDEX "bank_accounts_organization_id_idx" ON "bank_accounts"("organization_id");

-- CreateIndex
CREATE UNIQUE INDEX "bank_accounts_organization_id_bank_id_account_number_hmac_key" ON "bank_accounts"("organization_id", "bank_id", "account_number_hmac");

-- CreateIndex
CREATE UNIQUE INDEX "chart_of_accounts_organization_id_code_key" ON "chart_of_accounts"("organization_id", "code");

-- CreateIndex
CREATE UNIQUE INDEX "fee_type_account_mappings_organization_id_fee_type_key" ON "fee_type_account_mappings"("organization_id", "fee_type");

-- CreateIndex
CREATE UNIQUE INDEX "accounting_periods_organization_id_year_month_key" ON "accounting_periods"("organization_id", "year", "month");

-- CreateIndex
CREATE UNIQUE INDEX "holidays_organization_id_date_key" ON "holidays"("organization_id", "date");

-- AddForeignKey
ALTER TABLE "banks" ADD CONSTRAINT "banks_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "bank_accounts" ADD CONSTRAINT "bank_accounts_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "bank_accounts" ADD CONSTRAINT "bank_accounts_bank_id_fkey" FOREIGN KEY ("bank_id") REFERENCES "banks"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "bank_accounts" ADD CONSTRAINT "bank_accounts_gl_account_id_fkey" FOREIGN KEY ("gl_account_id") REFERENCES "chart_of_accounts"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "member_bank_accounts" ADD CONSTRAINT "member_bank_accounts_member_id_fkey" FOREIGN KEY ("member_id") REFERENCES "organization_members"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "member_bank_accounts" ADD CONSTRAINT "member_bank_accounts_bank_account_id_fkey" FOREIGN KEY ("bank_account_id") REFERENCES "bank_accounts"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "chart_of_accounts" ADD CONSTRAINT "chart_of_accounts_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "fee_type_account_mappings" ADD CONSTRAINT "fee_type_account_mappings_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "fee_type_account_mappings" ADD CONSTRAINT "fee_type_account_mappings_gl_account_id_fkey" FOREIGN KEY ("gl_account_id") REFERENCES "chart_of_accounts"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "accounting_periods" ADD CONSTRAINT "accounting_periods_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "holidays" ADD CONSTRAINT "holidays_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Bancos precargados: nombre único global.
CREATE UNIQUE INDEX "banks_system_name_unique" ON "banks"("name") WHERE "organization_id" IS NULL;

-- Integridad contable a nivel de BD.
ALTER TABLE "bank_accounts" ADD CONSTRAINT "bank_accounts_currency_check" CHECK ("currency" IN ('COP', 'USD'));
ALTER TABLE "bank_accounts" ADD CONSTRAINT "bank_accounts_last4_check" CHECK ("account_last4" ~ '^[0-9]{4}$');
ALTER TABLE "chart_of_accounts" ADD CONSTRAINT "chart_of_accounts_code_check" CHECK ("code" ~ '^[0-9]{1,12}$');
ALTER TABLE "chart_of_accounts" ADD CONSTRAINT "chart_of_accounts_level_check" CHECK ("level" BETWEEN 1 AND 5);
ALTER TABLE "accounting_periods" ADD CONSTRAINT "accounting_periods_month_check" CHECK ("month" BETWEEN 1 AND 12);
