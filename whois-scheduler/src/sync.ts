import { BATCH_SIZE, IANA_RDAP_DNS_URL } from "./constants";
import { type IanaRdapDnsJson, parseServices } from "./parse-services";

function isPublicationNewer(publication: string, lastProcessed: string | null): boolean {
  if (!lastProcessed) {
    return true;
  }
  return new Date(publication).getTime() > new Date(lastProcessed).getTime();
}

export async function syncRdapBootstrap(env: Env): Promise<void> {
  const response = await fetch(IANA_RDAP_DNS_URL);
  if (!response.ok) {
    throw new Error(`Failed to fetch IANA bootstrap: ${response.status}`);
  }

  const payload = (await response.json()) as IanaRdapDnsJson;
  if (!payload.publication || !Array.isArray(payload.services)) {
    throw new Error("Invalid IANA bootstrap payload");
  }

  const lastRow = await env.DB.prepare(
    "SELECT last_processed FROM rdap_whois_last_processed WHERE file = ?"
  )
    .bind(IANA_RDAP_DNS_URL)
    .first<{ last_processed: string }>();

  if (!isPublicationNewer(payload.publication, lastRow?.last_processed ?? null)) {
    console.log(
      JSON.stringify({
        event: "rdap_bootstrap_skipped",
        publication: payload.publication,
        lastProcessed: lastRow?.last_processed ?? null,
      })
    );
    return;
  }

  const rows = parseServices(payload.services);
  await env.DB.prepare("DELETE FROM rdap_whois_server").run();

  for (let i = 0; i < rows.length; i += BATCH_SIZE) {
    const chunk = rows.slice(i, i + BATCH_SIZE);
    const statements = chunk.map((row) =>
      env.DB.prepare("INSERT INTO rdap_whois_server (tld, rdap) VALUES (?, ?)").bind(
        row.tld,
        row.rdap
      )
    );
    await env.DB.batch(statements);
  }

  await env.DB.prepare(
    `INSERT INTO rdap_whois_last_processed (file, last_processed)
     VALUES (?, ?)
     ON CONFLICT(file) DO UPDATE SET last_processed = excluded.last_processed`
  )
    .bind(IANA_RDAP_DNS_URL, payload.publication)
    .run();

  console.log(
    JSON.stringify({
      event: "rdap_bootstrap_synced",
      publication: payload.publication,
      rowCount: rows.length,
    })
  );
}
