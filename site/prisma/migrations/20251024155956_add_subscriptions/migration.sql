-- CreateTable
CREATE TABLE "subscriptions" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "endpoint" TEXT NOT NULL,
    "auth" TEXT NOT NULL,
    "p256dh" TEXT NOT NULL,
    "domain" TEXT NOT NULL,
    "notify_changes" BOOLEAN NOT NULL DEFAULT false,
    "notify_expiry" BOOLEAN NOT NULL DEFAULT false,
    "created_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" DATETIME NOT NULL
);

-- CreateIndex
CREATE INDEX "subscriptions_domain_idx" ON "subscriptions"("domain");

-- CreateIndex
CREATE UNIQUE INDEX "subscriptions_endpoint_domain_key" ON "subscriptions"("endpoint", "domain");
