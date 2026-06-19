import { extractWhoisEventDates } from "./parse-whois-dates";
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

export async function fetchDomainLookup(
  env: Env,
  domain: string
): Promise<Record<string, unknown> | null> {
  const server = await lookupServerForDomain(env.DB, domain);
  if (!server) {
    return null;
  }

  const method = resolveLookupMethod(server);
  if (!method) {
    return null;
  }

  if (method === "rdap") {
    const rdapUrl = buildRdapUrl(server.rdap, domain);

    let upstream;
    try {
      upstream = await fetchRdap(rdapUrl);
    } catch {
      return null;
    }

    if (upstream.status !== 200) {
      return null;
    }

    try {
      const parsed = JSON.parse(upstream.body) as unknown;
      return treatRdapResponse(parsed);
    } catch {
      return null;
    }
  }

  let whoisText: string;
  try {
    whoisText = await fetchWhois(server.whois, domain);
  } catch {
    return null;
  }

  if (!whoisText) {
    return null;
  }

  const { expiringDate, lastChanged } = extractWhoisEventDates(whoisText);
  return {
    source: "whois",
    ldhName: domain,
    whoisText,
    updatedDate: lastChanged,
    expiryDate: expiringDate,
  };
}

/** @deprecated Use fetchDomainLookup */
export async function fetchDomainRdap(
  env: Env,
  domain: string
): Promise<Record<string, unknown> | null> {
  const data = await fetchDomainLookup(env, domain);
  if (!data || data.source === "whois") {
    return data?.source === "whois" ? null : data;
  }
  return data;
}
