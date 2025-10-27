CREATE TABLE "users" (
  "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
  "email" TEXT NOT NULL,
  "created_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE UNIQUE INDEX "users_email_key" ON "users"("email");

CREATE TABLE "user_domain_to_notify" (
  "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
  "domain_id" INTEGER NOT NULL,
  "user_id" INTEGER NOT NULL,
  "created_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "user_domain_to_notify_domain_id_fkey" FOREIGN KEY ("domain_id") REFERENCES "domains"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "user_domain_to_notify_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE UNIQUE INDEX "user_domain_to_notify_domain_id_user_id_key" ON "user_domain_to_notify" ("domain_id", "user_id");
CREATE INDEX "user_domain_to_notify_domain_id_idx" ON "user_domain_to_notify" ("domain_id");
CREATE INDEX "user_domain_to_notify_user_id_idx" ON "user_domain_to_notify" ("user_id");
