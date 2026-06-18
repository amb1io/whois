export function tldCandidates(domain: string): string[] {
  const parts = domain.split(".");
  const candidates: string[] = [];

  for (let index = 1; index < parts.length; index++) {
    candidates.push(parts.slice(index).join("."));
  }

  return candidates;
}

export function extractTld(domain: string): string {
  const candidates = tldCandidates(domain);
  return candidates[candidates.length - 1] ?? domain;
}
