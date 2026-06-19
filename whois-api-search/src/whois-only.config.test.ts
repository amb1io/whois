import { describe, expect, it } from "vitest";
import {
  exampleDomainForTld,
  loadWhoisOnlyTldConfig,
  whoisOnlyTlds,
} from "./whois-only-validation";
import { parseWhoisHost } from "./whois-host";
import { resolveLookupMethod } from "./server";

describe("whois-only TLD list", () => {
  it("contains 164 TLDs", () => {
    expect(whoisOnlyTlds).toHaveLength(164);
    expect(new Set(whoisOnlyTlds).size).toBe(164);
  });
});

describe("whois-only TLD configuration", () => {
  it.each(whoisOnlyTlds)(".%s is configured with whois and without rdap", (tld) => {
    const config = loadWhoisOnlyTldConfig(tld);

    expect(config.tld).toBe(tld);
    expect(config.rdap).toBe("");
    expect(config.whois).not.toBe("");
    expect(resolveLookupMethod(config)).toBe("whois");
    expect(() => parseWhoisHost(config.whois)).not.toThrow();
    expect(exampleDomainForTld(tld)).toBe(`example.${tld}`);
  });
});
