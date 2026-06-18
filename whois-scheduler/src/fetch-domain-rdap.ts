import {
  buildRdapOrgFallbackUrl,
  buildRdapUrl,
  fetchRdap,
  lookupRdapServerForDomain,
  treatRdapResponse,
} from "./rdap";

export async function fetchDomainRdap(
  env: Env,
  domain: string
): Promise<Record<string, unknown> | null> {
  const match = await lookupRdapServerForDomain(env.DB, domain);
  const rdapUrl = match
    ? buildRdapUrl(match.rdap, domain)
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
