import { kvInfoKey, kvSearchKey } from "./cache";
import {
  getStoredDescription,
  upsertDomainResult,
  warmCacheFromDescription,
} from "./persist";
import {
  buildRdapUrl,
  fetchRdap,
  treatRdapResponse,
} from "./rdap";
import {
  lookupServerForDomain,
  resolveLookupMethod,
} from "./server";
import { fetchWhois } from "./whois";
import { extractWhoisEventDates } from "./parse-whois-dates";

export type DomainCacheSource = "HIT" | "D1" | "MISS";

export interface ResolvedDomainRdap {
  kind: "rdap";
  rdap: Record<string, unknown>;
  description: string;
  cache: DomainCacheSource;
}

export interface ResolvedDomainWhois {
  kind: "whois";
  ldhName: string;
  whoisText: string;
  updatedDate: string | null;
  expiryDate: string | null;
  description: string;
  cache: DomainCacheSource;
}

export interface ResolveDomainError {
  kind: "error";
  status: 404 | 422 | 502;
  error: string;
}

export type ResolveDomainResult =
  | ResolvedDomainRdap
  | ResolvedDomainWhois
  | ResolveDomainError;

function parseCachedDescription(description: string): ResolveDomainResult | null {
  try {
    const parsed = JSON.parse(description) as Record<string, unknown>;
    if (parsed.source === "whois" && typeof parsed.whoisText === "string") {
      const dates =
        typeof parsed.updatedDate === "string" || typeof parsed.expiryDate === "string"
          ? {
              lastChanged:
                typeof parsed.updatedDate === "string" ? parsed.updatedDate : null,
              expiringDate:
                typeof parsed.expiryDate === "string" ? parsed.expiryDate : null,
            }
          : extractWhoisEventDates(parsed.whoisText);

      return {
        kind: "whois",
        ldhName: typeof parsed.ldhName === "string" ? parsed.ldhName : "",
        whoisText: parsed.whoisText,
        updatedDate: dates.lastChanged,
        expiryDate: dates.expiringDate,
        description,
        cache: "HIT",
      };
    }

    return {
      kind: "rdap",
      rdap: parsed,
      description,
      cache: "HIT",
    };
  } catch {
    return null;
  }
}

export async function resolveDomain(
  env: Env,
  domain: string
): Promise<ResolveDomainResult> {
  const kvDescription = await env.CACHE.get(kvInfoKey(domain));
  if (kvDescription) {
    const cached = parseCachedDescription(kvDescription);
    if (cached) {
      cached.cache = "HIT";
      if (cached.kind === "rdap") {
        const serverUsed = (await env.CACHE.get(kvSearchKey(domain))) ?? "";
        try {
          await upsertDomainResult(env, domain, serverUsed, cached.rdap);
        } catch (error) {
          console.error(
            JSON.stringify({
              event: "d1_sync_from_kv_failed",
              domain,
              error: String(error),
            })
          );
        }
      }
      return cached;
    }
  }

  const storedDescription = await getStoredDescription(env, domain);
  if (storedDescription) {
    const cached = parseCachedDescription(storedDescription);
    if (cached) {
      cached.cache = "D1";
      const serverUsed = (await env.CACHE.get(kvSearchKey(domain))) ?? "";
      await warmCacheFromDescription(env, domain, storedDescription, serverUsed);
      return cached;
    }
  }

  const server = await lookupServerForDomain(env.DB, domain);
  if (!server) {
    return {
      kind: "error",
      status: 404,
      error: "TLD not supported for domain lookup",
    };
  }

  const method = resolveLookupMethod(server);
  if (!method) {
    return {
      kind: "error",
      status: 422,
      error: `No RDAP or WHOIS server configured for .${server.tld}`,
    };
  }

  if (method === "rdap") {
    const rdapUrl = buildRdapUrl(server.rdap, domain);

    let upstream;
    try {
      upstream = await fetchRdap(rdapUrl);
    } catch {
      return {
        kind: "error",
        status: 502,
        error: "Upstream RDAP request failed",
      };
    }

    if (upstream.status !== 200) {
      return {
        kind: "error",
        status: 502,
        error: "Upstream RDAP request failed",
      };
    }

    let treated: Record<string, unknown>;
    try {
      const parsed = JSON.parse(upstream.body) as unknown;
      treated = treatRdapResponse(parsed);
    } catch {
      return {
        kind: "error",
        status: 502,
        error: "Invalid RDAP response from upstream server",
      };
    }

    try {
      await upsertDomainResult(env, domain, server.rdap, treated);
    } catch (error) {
      console.error(
        JSON.stringify({
          event: "d1_persist_failed",
          domain,
          error: String(error),
        })
      );
      return {
        kind: "error",
        status: 502,
        error: "Failed to persist domain lookup result",
      };
    }

    const description = JSON.stringify(treated);
    return { kind: "rdap", rdap: treated, description, cache: "MISS" };
  }

  let whoisText: string;
  try {
    whoisText = await fetchWhois(server.whois, domain);
  } catch {
    return {
      kind: "error",
      status: 502,
      error: "Upstream WHOIS request failed",
    };
  }

  if (!whoisText) {
    return {
      kind: "error",
      status: 502,
      error: "Empty WHOIS response from upstream server",
    };
  }

  const { expiringDate, lastChanged } = extractWhoisEventDates(whoisText);
  const payload = {
    source: "whois",
    ldhName: domain,
    whoisText,
    updatedDate: lastChanged,
    expiryDate: expiringDate,
  };
  const description = JSON.stringify(payload);

  try {
    await upsertDomainResult(env, domain, server.whois, payload);
  } catch (error) {
    console.error(
      JSON.stringify({
        event: "d1_persist_failed",
        domain,
        error: String(error),
      })
    );
    return {
      kind: "error",
      status: 502,
      error: "Failed to persist domain lookup result",
    };
  }

  return {
    kind: "whois",
    ldhName: domain,
    whoisText,
    updatedDate: lastChanged,
    expiryDate: expiringDate,
    description,
    cache: "MISS",
  };
}
