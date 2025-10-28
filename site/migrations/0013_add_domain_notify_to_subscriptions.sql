ALTER TABLE subscriptions
  ADD COLUMN domain_notify BOOLEAN NOT NULL DEFAULT false;
