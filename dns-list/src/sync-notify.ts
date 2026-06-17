import { fetchDomainRdap } from "./fetch-domain-rdap";
import { upsertDomainDescription } from "./persist-domains";
import { extractRdapEventDates } from "./rdap";

type NotifyScope = "expiring" | "all" | "changes";

interface NotifyRow {
  domain: string;
  scope: NotifyScope;
  notify_at: string;
  expiring_date: string | null;
  last_changed: string | null;
}

function utcDateOnly(value: Date | string): string {
  const date = typeof value === "string" ? new Date(value) : value;
  return date.toISOString().slice(0, 10);
}

async function updateNotifyLastChanged(
  env: Env,
  row: NotifyRow,
  lastChanged: string
): Promise<void> {
  await env.DB.prepare(
    `UPDATE rdap_whois_notify
     SET last_changed = ?
     WHERE domain = ? AND notify_at = ? AND scope = ?`
  )
    .bind(lastChanged, row.domain, row.notify_at, row.scope)
    .run();
}

async function processChangesFlow(env: Env, row: NotifyRow): Promise<void> {
  const rdap = await fetchDomainRdap(env, row.domain);
  if (!rdap) {
    return;
  }

  const { lastChanged } = extractRdapEventDates(rdap);
  if (!lastChanged || lastChanged === row.last_changed) {
    return;
  }

  await upsertDomainDescription(env, row.domain, JSON.stringify(rdap));
  await updateNotifyLastChanged(env, row, lastChanged);

  console.log(
    JSON.stringify({
      event: "notify_sync_updated",
      domain: row.domain,
      scope: row.scope,
      reason: "last_changed",
    })
  );
}

async function processExpiringFlow(
  env: Env,
  row: NotifyRow,
  todayUtc: string
): Promise<void> {
  if (!row.expiring_date) {
    return;
  }

  if (utcDateOnly(row.expiring_date) !== todayUtc) {
    return;
  }

  const rdap = await fetchDomainRdap(env, row.domain);
  if (!rdap) {
    return;
  }

  await upsertDomainDescription(env, row.domain, JSON.stringify(rdap));

  console.log(
    JSON.stringify({
      event: "notify_sync_updated",
      domain: row.domain,
      scope: row.scope,
      reason: "expiring",
    })
  );
}

function runsChangesFlow(scope: NotifyScope): boolean {
  return scope === "changes" || scope === "all";
}

function runsExpiringFlow(scope: NotifyScope): boolean {
  return scope === "expiring" || scope === "all";
}

export async function syncNotifySubscriptions(env: Env): Promise<void> {
  const { results } = await env.DB.prepare(
    `SELECT domain, scope, notify_at, expiring_date, last_changed
     FROM rdap_whois_notify`
  ).all<NotifyRow>();

  const rows = results ?? [];
  const todayUtc = utcDateOnly(new Date());

  for (const row of rows) {
    try {
      if (runsChangesFlow(row.scope)) {
        await processChangesFlow(env, row);
      }
      if (runsExpiringFlow(row.scope)) {
        await processExpiringFlow(env, row, todayUtc);
      }
    } catch (error) {
      console.error(
        JSON.stringify({
          event: "notify_sync_failed",
          domain: row.domain,
          scope: row.scope,
          error: String(error),
        })
      );
    }
  }

  console.log(
    JSON.stringify({
      event: "notify_sync_completed",
      processed: rows.length,
    })
  );
}
