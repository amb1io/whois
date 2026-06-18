export async function upsertDomainDescription(
  env: Env,
  domain: string,
  description: string
): Promise<void> {
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
}
