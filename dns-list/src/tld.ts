export function extractTld(domain: string): string {
  const parts = domain.split(".");
  return parts[parts.length - 1] ?? domain;
}
