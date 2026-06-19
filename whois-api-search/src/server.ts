import { tldCandidates } from "./tld";

export interface ServerRecord {
  tld: string;
  rdap: string;
  whois: string;
}

export async function lookupServer(
  db: D1Database,
  tld: string
): Promise<ServerRecord | null> {
  const row = await db
    .prepare("SELECT tld, rdap, whois FROM rdap_whois_server WHERE tld = ? LIMIT 1")
    .bind(tld)
    .first<{ tld: string; rdap: string; whois: string }>();

  if (!row) {
    return null;
  }

  return {
    tld: row.tld,
    rdap: row.rdap?.trim() ?? "",
    whois: row.whois?.trim() ?? "",
  };
}

export async function lookupServerForDomain(
  db: D1Database,
  domain: string
): Promise<ServerRecord | null> {
  for (const tld of tldCandidates(domain)) {
    const match = await lookupServer(db, tld);
    if (match) {
      return match;
    }
  }

  return null;
}

export function resolveLookupMethod(
  server: ServerRecord
): "rdap" | "whois" | null {
  if (server.rdap) {
    return "rdap";
  }

  if (server.whois) {
    return "whois";
  }

  return null;
}
