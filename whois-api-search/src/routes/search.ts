import { Hono } from "hono";
import { resolveDomainRdap } from "../resolve-rdap";
import { normalizeDomain } from "../tld";
import {
  buildRdapOrgFallbackUrl,
  buildRdapUrl,
  fetchRdap,
  lookupRdapServerForDomain,
} from "../rdap";

const searchRoute = new Hono<{ Bindings: Env }>();

function rdapJsonResponse(body: string, cache: "HIT" | "MISS" | "D1"): Response {
  return new Response(body, {
    status: 200,
    headers: {
      "Content-Type": "application/rdap+json",
      "X-Cache": cache,
    },
  });
}

searchRoute.post("/search", async (c) => {
  let body: { domain?: string };

  const contentType = c.req.header("content-type") ?? "";
  if (contentType.includes("application/json")) {
    try {
      body = await c.req.json<{ domain?: string }>();
    } catch {
      return c.json({ error: "invalid json body" }, 400);
    }
  } else {
    const form = await c.req.parseBody();
    const domainField = form.domain;
    body = {
      domain: typeof domainField === "string" ? domainField : undefined,
    };
  }

  const domain = normalizeDomain(body.domain ?? "");
  if (!domain) {
    return c.json({ error: "invalid domain" }, 400);
  }

  const resolved = await resolveDomainRdap(c.env, domain);
  if (resolved) {
    return rdapJsonResponse(resolved.description, resolved.cache);
  }

  const match = await lookupRdapServerForDomain(c.env.DB, domain);
  const rdapUrl = match
    ? buildRdapUrl(match.rdap, domain)
    : buildRdapOrgFallbackUrl(domain);

  let upstream;
  try {
    upstream = await fetchRdap(rdapUrl);
  } catch {
    return c.json({ error: "upstream rdap request failed" }, 502);
  }

  return new Response(upstream.body, {
    status: upstream.status,
    headers: {
      "Content-Type": upstream.contentType ?? "application/json",
    },
  });
});

export { searchRoute };
