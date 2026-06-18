const KV_PREFIX = "whois-api-search:";

export function kvSearchKey(domain: string): string {
  return `${KV_PREFIX}${domain}_search`;
}

export function kvInfoKey(domain: string): string {
  return `${KV_PREFIX}${domain}_info`;
}
