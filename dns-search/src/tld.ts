const DOMAIN_PATTERN = /^(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/;

export function normalizeDomain(input: string): string | null {
  let domain = input.trim().toLowerCase();
  if (!domain) {
    return null;
  }

  domain = domain.replace(/^https?:\/\//, "");
  domain = domain.split("/")[0] ?? domain;
  domain = domain.split("?")[0] ?? domain;
  domain = domain.split("#")[0] ?? domain;
  domain = domain.replace(/:\d+$/, "");
  domain = domain.replace(/\.$/, "");

  if (!domain.includes(".") || !DOMAIN_PATTERN.test(domain)) {
    return null;
  }

  return domain;
}

export function extractTld(domain: string): string {
  const parts = domain.split(".");
  return parts[parts.length - 1] ?? domain;
}
