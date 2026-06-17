import { kvInfoKey, kvSearchKey } from "./cache";

export async function upsertDomainResult(
  env: Env,
  domain: string,
  serverUsed: string,
  treated: Record<string, unknown>
): Promise<void> {
  const description = JSON.stringify(treated);

  const result = await env.DB.prepare(
    `INSERT INTO rdap_whois_domains (domain, description)
     VALUES (?, ?)
     ON CONFLICT(domain) DO UPDATE SET description = excluded.description`
  )
    .bind(domain, description)
    .run();

  if (!result.success) {
    throw new Error(`failed to upsert rdap_whois_domains for ${domain}`);
  }

  await env.CACHE.put(kvSearchKey(domain), serverUsed);
  await env.CACHE.put(kvInfoKey(domain), description);
}

export async function getStoredDescription(
  env: Env,
  domain: string
): Promise<string | null> {
  const row = await env.DB.prepare(
    "SELECT description FROM rdap_whois_domains WHERE domain = ?"
  )
    .bind(domain)
    .first<{ description: string }>();

  return row?.description ?? null;
}

export async function warmCacheFromDescription(
  env: Env,
  domain: string,
  description: string,
  serverUsed: string
): Promise<void> {
  await env.CACHE.put(kvSearchKey(domain), serverUsed);
  await env.CACHE.put(kvInfoKey(domain), description);
}
