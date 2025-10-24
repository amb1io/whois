CREATE TABLE IF NOT EXISTS domains (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  domain TEXT NOT NULL,
  registrar TEXT,
  registrar_id TEXT,
  registrar_email TEXT,
  reseller TEXT,
  statuses JSON,
  nameservers JSON,
  created_at DATETIME,
  updated_at DATETIME,
  expires_at DATETIME,
  process_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS domains_domain_idx ON domains (domain);
CREATE INDEX IF NOT EXISTS domains_process_at_idx ON domains (process_at);
