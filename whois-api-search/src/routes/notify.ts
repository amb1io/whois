import { Hono } from "hono";
import { extractDomainEventDates } from "../domain-dates";
import { resolveDomain } from "../resolve-domain";
import { normalizeDomain } from "../tld";
import {
  type NotifyScope,
  upsertNotifySubscription,
} from "../notify-persist";

const NOTIFY_SCOPES = new Set<NotifyScope>(["expiring", "all", "changes"]);
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

const notifyRoute = new Hono<{ Bindings: Env }>();

function domainPayload(resolved: Exclude<Awaited<ReturnType<typeof resolveDomain>>, { kind: "error" }>): Record<string, unknown> {
  if (resolved.kind === "rdap") {
    return resolved.rdap;
  }

  return {
    source: "whois",
    ldhName: resolved.ldhName,
    whoisText: resolved.whoisText,
    updatedDate: resolved.updatedDate,
    expiryDate: resolved.expiryDate,
  };
}

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

  const resolved = await resolveDomain(c.env, domain);
  if (resolved.kind === "error") {
    return c.json({ error: resolved.error }, resolved.status);
  }

  const { expiringDate, lastChanged } = extractDomainEventDates(
    domainPayload(resolved)
  );

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
