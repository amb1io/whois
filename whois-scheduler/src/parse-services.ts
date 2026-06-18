export interface RdapServerRow {
  tld: string;
  rdap: string;
}

export interface IanaRdapDnsJson {
  publication: string;
  services: [string[], string[]][];
}

export function parseServices(services: IanaRdapDnsJson["services"]): RdapServerRow[] {
  const rows: RdapServerRow[] = [];

  for (const entry of services) {
    if (!Array.isArray(entry) || entry.length < 2) {
      continue;
    }

    const [tlds, rdapUrls] = entry;
    if (!Array.isArray(tlds) || !Array.isArray(rdapUrls)) {
      continue;
    }

    for (const tld of tlds) {
      if (typeof tld !== "string" || !tld.trim()) {
        continue;
      }
      for (const rdap of rdapUrls) {
        if (typeof rdap !== "string" || !rdap.trim()) {
          continue;
        }
        rows.push({ tld: tld.trim(), rdap: rdap.trim() });
      }
    }
  }

  return rows;
}
