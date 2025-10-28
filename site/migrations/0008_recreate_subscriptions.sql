PRAGMA foreign_keys=OFF;

DROP TABLE IF EXISTS "subscriptions";

CREATE TABLE "subscriptions" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "endpoint" TEXT NOT NULL,
    "auth" TEXT NOT NULL,
    "p256dh" TEXT NOT NULL,
    "domain_id" INTEGER NOT NULL,
    "user_id" INTEGER NOT NULL,
    "notify_changes" BOOLEAN NOT NULL DEFAULT false,
    "notify_expiry" BOOLEAN NOT NULL DEFAULT false,
    "created_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "subscriptions_domain_id_fkey" FOREIGN KEY ("domain_id") REFERENCES "domains"("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "subscriptions_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE UNIQUE INDEX "subscriptions_endpoint_domain_id_user_id_key" ON "subscriptions"("endpoint", "domain_id", "user_id");
CREATE INDEX "subscriptions_domain_id_idx" ON "subscriptions"("domain_id");
CREATE INDEX "subscriptions_user_id_idx" ON "subscriptions"("user_id");

PRAGMA foreign_keys=ON;
