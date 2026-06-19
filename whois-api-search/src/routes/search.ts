import { Hono } from "hono";
import { resolveDomain } from "../resolve-domain";
import { normalizeDomain } from "../tld";

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

function whoisJsonResponse(
  body: Record<string, unknown>,
  cache: "HIT" | "MISS" | "D1"
): Response {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: {
      "Content-Type": "application/json",
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

  const resolved = await resolveDomain(c.env, domain);
  if (resolved.kind === "error") {
    return c.json({ error: resolved.error }, resolved.status);
  }

  if (resolved.kind === "rdap") {
    return rdapJsonResponse(resolved.description, resolved.cache);
  }

  return whoisJsonResponse(
    {
      source: "whois",
      ldhName: resolved.ldhName,
      whoisText: resolved.whoisText,
      updatedDate: resolved.updatedDate,
      expiryDate: resolved.expiryDate,
    },
    resolved.cache
  );
});

export { searchRoute };
