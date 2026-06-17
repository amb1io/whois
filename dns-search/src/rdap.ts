export const RDAP_ORG_FALLBACK = "https://rdap.org";

export function buildRdapUrl(rdapBase: string, domain: string): string {
  const base = rdapBase.replace(/\/+$/, "");

  if (base.endsWith("/rdap")) {
    return `${base}/domain/${domain}`;
  }

  if (/\/v\d+$/.test(base)) {
    return `${base}/domain/${domain}`;
  }

  return `${base}/rdap/domain/${domain}`;
}

export function buildRdapOrgFallbackUrl(domain: string): string {
  return `${RDAP_ORG_FALLBACK}/domain/${domain}`;
}

export function treatRdapResponse(raw: unknown): Record<string, unknown> {
  if (!raw || typeof raw !== "object") {
    throw new Error("invalid rdap response");
  }

  const data = raw as Record<string, unknown>;
  if (data.objectClassName !== "domain" && !data.ldhName) {
    throw new Error("not a domain rdap object");
  }

  return data;
}

export async function lookupRdapServer(
  db: D1Database,
  tld: string
): Promise<string | null> {
  const row = await db
    .prepare("SELECT rdap FROM rdap_whois_server WHERE tld = ? LIMIT 1")
    .bind(tld)
    .first<{ rdap: string }>();

  return row?.rdap ?? null;
}

export async function fetchRdap(
  url: string
): Promise<{ status: number; body: string; contentType: string | null }> {
  const response = await fetch(url, {
    headers: {
      Accept: "application/rdap+json, application/json",
    },
  });

  const body = await response.text();
  return {
    status: response.status,
    body,
    contentType: response.headers.get("Content-Type"),
  };
}

interface RdapEvent {
  eventAction?: string;
  eventDate?: string;
}

export function extractRdapEventDates(rdap: Record<string, unknown>): {
  expiringDate: string | null;
  lastChanged: string | null;
} {
  const events = Array.isArray(rdap.events) ? (rdap.events as RdapEvent[]) : [];
  const findDate = (action: string): string | null => {
    const event = events.find((entry) => entry?.eventAction === action);
    return typeof event?.eventDate === "string" ? event.eventDate : null;
  };

  return {
    expiringDate: findDate("expiration"),
    lastChanged: findDate("last changed"),
  };
}
