const KV_PREFIX = "dns-search:";

export function kvSearchKey(domain: string): string {
  return `${KV_PREFIX}${domain}_search`;
}

export function kvInfoKey(domain: string): string {
  return `${KV_PREFIX}${domain}_info`;
}
