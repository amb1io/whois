import { Hono } from "hono";
import {
  type NotifyScope,
  upsertNotifySubscription,
} from "../notify-persist";
import { extractRdapEventDates } from "../rdap";
import { resolveDomainRdap } from "../resolve-rdap";
import { normalizeDomain } from "../tld";

const NOTIFY_SCOPES = new Set<NotifyScope>(["expiring", "all", "changes"]);
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

const notifyRoute = new Hono<{ Bindings: Env }>();

notifyRoute.post("/notify", async (c) => {
  let body: { domain?: string; scope?: string; notify_at?: string };
  try {
    body = await c.req.json<{
      domain?: string;
      scope?: string;
      notify_at?: string;
    }>();
  } catch {
    return c.json({ error: "invalid json body" }, 400);
  }

  const domain = normalizeDomain(body.domain ?? "");
  if (!domain) {
    return c.json({ error: "invalid domain" }, 400);
  }

  const scope = body.scope as NotifyScope;
  if (!scope || !NOTIFY_SCOPES.has(scope)) {
    return c.json({ error: "invalid scope" }, 400);
  }

  const notifyAt = body.notify_at?.trim() ?? "";
  if (!notifyAt || !EMAIL_PATTERN.test(notifyAt)) {
    return c.json({ error: "invalid notify_at email" }, 400);
  }

  const resolved = await resolveDomainRdap(c.env, domain);
  if (!resolved) {
    return c.json({ error: "rdap data not found for domain" }, 404);
  }

  const { expiringDate, lastChanged } = extractRdapEventDates(resolved.rdap);

  try {
    await upsertNotifySubscription(c.env, {
      domain,
      scope,
      notify_at: notifyAt,
      expiring_date: expiringDate,
      last_changed: lastChanged,
    });
  } catch (error) {
    console.error(
      JSON.stringify({
        event: "notify_persist_failed",
        domain,
        error: String(error),
      })
    );
    return c.json({ error: "failed to persist notify subscription" }, 500);
  }

  return c.json(
    {
      domain,
      scope,
      notify_at: notifyAt,
      expiring_date: expiringDate,
      last_changed: lastChanged,
    },
    201
  );
});

export { notifyRoute };
