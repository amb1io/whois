ALTER TABLE subscriptions
  ADD COLUMN user_read BOOLEAN NOT NULL DEFAULT false;
