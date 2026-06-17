CREATE TABLE IF NOT EXISTS rdap_whois_notify (
  domain TEXT NOT NULL,
  scope TEXT NOT NULL,
  notify_at TEXT NOT NULL,
  expiring_date TEXT,
  last_changed TEXT,
  PRIMARY KEY (domain, notify_at, scope)
);
