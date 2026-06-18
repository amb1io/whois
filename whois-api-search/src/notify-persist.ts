export type NotifyScope = "expiring" | "all" | "changes";

export interface NotifySubscription {
  domain: string;
  scope: NotifyScope;
  notify_at: string;
  expiring_date: string | null;
  last_changed: string | null;
}

export async function upsertNotifySubscription(
  env: Env,
  subscription: NotifySubscription
): Promise<void> {
  const result = await env.DB.prepare(
    `INSERT INTO rdap_whois_notify (domain, scope, notify_at, expiring_date, last_changed)
     VALUES (?, ?, ?, ?, ?)
     ON CONFLICT(domain, notify_at, scope) DO UPDATE SET
       expiring_date = excluded.expiring_date,
       last_changed = excluded.last_changed`
  )
    .bind(
      subscription.domain,
      subscription.scope,
      subscription.notify_at,
      subscription.expiring_date,
      subscription.last_changed
    )
    .run();

  if (!result.success) {
    throw new Error(`failed to upsert rdap_whois_notify for ${subscription.domain}`);
  }
}
