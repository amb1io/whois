import {
  buildRdapOrgFallbackUrl,
  buildRdapUrl,
  fetchRdap,
  lookupRdapServer,
  treatRdapResponse,
} from "./rdap";
import { extractTld } from "./tld";

export async function fetchDomainRdap(
  env: Env,
  domain: string
): Promise<Record<string, unknown> | null> {
  const tld = extractTld(domain);
  const rdapServer = await lookupRdapServer(env.DB, tld);
  const rdapUrl = rdapServer
    ? buildRdapUrl(rdapServer, domain)
    : buildRdapOrgFallbackUrl(domain);

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
