CREATE TABLE IF NOT EXISTS subscriptions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  endpoint TEXT NOT NULL,
  auth TEXT NOT NULL,
  p256dh TEXT NOT NULL,
  domain TEXT NOT NULL,
  notify_changes INTEGER NOT NULL DEFAULT 0,
  notify_expiry INTEGER NOT NULL DEFAULT 0,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL
);

CREATE INDEX IF NOT EXISTS subscriptions_domain_idx ON subscriptions (domain);
CREATE UNIQUE INDEX IF NOT EXISTS subscriptions_endpoint_domain_key ON subscriptions (endpoint, domain);
