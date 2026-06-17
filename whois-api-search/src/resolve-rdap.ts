import { kvInfoKey, kvSearchKey } from "./cache";
import {
  getStoredDescription,
  upsertDomainResult,
  warmCacheFromDescription,
} from "./persist";
import {
  buildRdapOrgFallbackUrl,
  buildRdapUrl,
  fetchRdap,
  lookupRdapServerForDomain,
  RDAP_ORG_FALLBACK,
  treatRdapResponse,
} from "./rdap";

export type RdapCacheSource = "HIT" | "D1" | "MISS";

export interface ResolvedDomainRdap {
  rdap: Record<string, unknown>;
  description: string;
  cache: RdapCacheSource;
}

export async function resolveDomainRdap(
  env: Env,
  domain: string
): Promise<ResolvedDomainRdap | null> {
  const kvDescription = await env.CACHE.get(kvInfoKey(domain));
  if (kvDescription) {
    const serverUsed =
      (await env.CACHE.get(kvSearchKey(domain))) ?? RDAP_ORG_FALLBACK;
    try {
      const treated = JSON.parse(kvDescription) as Record<string, unknown>;
      await upsertDomainResult(env, domain, serverUsed, treated);
    } catch (error) {
      console.error(
        JSON.stringify({
          event: "d1_sync_from_kv_failed",
          domain,
          error: String(error),
        })
      );
    }
    return { rdap: JSON.parse(kvDescription) as Record<string, unknown>, description: kvDescription, cache: "HIT" };
  }

  const storedDescription = await getStoredDescription(env, domain);
  if (storedDescription) {
    const serverUsed =
      (await env.CACHE.get(kvSearchKey(domain))) ?? RDAP_ORG_FALLBACK;
    await warmCacheFromDescription(env, domain, storedDescription, serverUsed);
    return {
      rdap: JSON.parse(storedDescription) as Record<string, unknown>,
      description: storedDescription,
      cache: "D1",
    };
  }

  const match = await lookupRdapServerForDomain(env.DB, domain);
  const serverUsed = match?.rdap ?? RDAP_ORG_FALLBACK;
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

  let treated: Record<string, unknown>;
  try {
    const parsed = JSON.parse(upstream.body) as unknown;
    treated = treatRdapResponse(parsed);
  } catch {
    return null;
  }

  try {
    await upsertDomainResult(env, domain, serverUsed, treated);
  } catch (error) {
    console.error(
      JSON.stringify({
        event: "d1_persist_failed",
        domain,
        error: String(error),
      })
    );
    return null;
  }

  const description = JSON.stringify(treated);
  return { rdap: treated, description, cache: "MISS" };
}
