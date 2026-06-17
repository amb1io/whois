CREATE TABLE IF NOT EXISTS rdap_whois_server (
  tld TEXT NOT NULL,
  rdap TEXT NOT NULL,
  PRIMARY KEY (tld, rdap)
);

CREATE TABLE IF NOT EXISTS rdap_whois_last_processed (
  file TEXT PRIMARY KEY,
  last_processed TEXT NOT NULL
);
