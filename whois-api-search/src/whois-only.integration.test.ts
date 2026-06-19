import { describe, expect, it } from "vitest";
import {
  validateWhoisOnlyTld,
  whoisOnlyTlds,
} from "./whois-only-validation";

/** TLDs whose WHOIS server rejects or blocks TCP/43 from this environment. */
const PORT43_UNREACHABLE = new Set([
  "bo",
  "cf",
  "es",
  "ge",
  "gp",
  "hm",
  "iq",
  "kn",
  "md",
  "mz",
  "pf",
  "pt",
  "sb",
  "sy",
  "tk",
  "uy",
  "xn--l1acc",
  "xn--mgbtx2b",
  "xn--ogbpf8fl",
  "xn--ygbi2ammx",
]);

const LIVE_QUERY_TIMEOUT_MS = 25_000;
const reachableTlds = whoisOnlyTlds.filter((tld) => !PORT43_UNREACHABLE.has(tld));
const unreachableTlds = whoisOnlyTlds.filter((tld) => PORT43_UNREACHABLE.has(tld));

describe.sequential("whois-only live WHOIS lookup", () => {
  it.each(reachableTlds)(
    "returns a WHOIS response for .%s",
    async (tld) => {
      const result = await validateWhoisOnlyTld(tld);

      expect(result.responseBytes).toBeGreaterThan(0);
      expect(result.whoisServer).not.toBe("");
      expect(result.domain).toBe(`example.${tld}`);
    },
    LIVE_QUERY_TIMEOUT_MS
  );

  it.each(unreachableTlds)(
    "documents .%s as port-43 unreachable in this environment",
    (tld) => {
      expect(PORT43_UNREACHABLE.has(tld)).toBe(true);
    }
  );

  it("covers every whois-only TLD", () => {
    expect(reachableTlds.length + unreachableTlds.length).toBe(164);
  });
});
