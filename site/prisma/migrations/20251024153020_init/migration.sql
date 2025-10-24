-- CreateTable
CREATE TABLE "domains" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "domain" TEXT NOT NULL,
    "registrar" TEXT,
    "registrar_id" TEXT,
    "registrar_email" TEXT,
    "reseller" TEXT,
    "statuses" JSONB,
    "nameservers" JSONB,
    "created_at" DATETIME,
    "updated_at" DATETIME,
    "expires_at" DATETIME,
    "process_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- CreateIndex
CREATE INDEX "domains_domain_idx" ON "domains"("domain");

-- CreateIndex
CREATE INDEX "domains_process_at_idx" ON "domains"("process_at");
