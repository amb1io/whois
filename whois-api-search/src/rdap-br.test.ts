import { describe, expect, it } from "vitest";
import {
  buildRdapOrgFallbackUrl,
  buildRdapUrl,
  lookupRdapServerForDomain,
} from "./rdap";
import { tldCandidates } from "./tld";

const REGISTRO_BR_SERVER = "https://rdap.registro.br/";

function mockRdapDb(servers: Record<string, string>): D1Database {
  return {
    prepare: (_sql: string) => ({
      bind: (tld: string) => ({
        first: async () => {
          const rdap = servers[tld];
          return rdap ? { rdap } : null;
        },
      }),
    }),
  } as unknown as D1Database;
}

describe("tldCandidates", () => {
  it.each([
    ["rhamses.com.br", ["com.br", "br"]],
    ["tudopelanhl.com.br", ["com.br", "br"]],
    ["example.co.uk", ["co.uk", "uk"]],
    ["presenca.online", ["online"]],
  ])("returns longest suffix first for %s", (domain, expected) => {
    expect(tldCandidates(domain)).toEqual(expected);
  });
});

describe("buildRdapUrl", () => {
  it.each([
    ["rhamses.com.br", "https://rdap.registro.br/domain/rhamses.com.br"],
    ["tudopelanhl.com.br", "https://rdap.registro.br/domain/tudopelanhl.com.br"],
  ])("uses /domain/ for root-only registro.br base (%s)", (domain, expected) => {
    expect(buildRdapUrl(REGISTRO_BR_SERVER, domain)).toBe(expected);
  });

  it("uses /rdap/domain/ for bases with a non-root path", () => {
    expect(buildRdapUrl("https://rdap.example.com/api", "example.com")).toBe(
      "https://rdap.example.com/api/rdap/domain/example.com"
    );
  });

  it("keeps /rdap/domain/ when the base already ends with /rdap", () => {
    expect(buildRdapUrl("https://rdap.example.com/rdap", "example.com")).toBe(
      "https://rdap.example.com/rdap/domain/example.com"
    );
  });

  it("uses /domain/ for versioned API bases", () => {
    expect(buildRdapUrl("https://rdap.verisign.com/com/v1", "example.com")).toBe(
      "https://rdap.verisign.com/com/v1/domain/example.com"
    );
  });
});

describe("lookupRdapServerForDomain", () => {
  const brOnlyDb = mockRdapDb({ br: REGISTRO_BR_SERVER });

  it.each(["rhamses.com.br", "tudopelanhl.com.br"])(
    "resolves %s via the br rdap_whois_server row",
    async (domain) => {
      await expect(lookupRdapServerForDomain(brOnlyDb, domain)).resolves.toEqual({
        tld: "br",
        rdap: REGISTRO_BR_SERVER,
      });
    }
  );

  it("prefers a longer matching suffix when present", async () => {
    const db = mockRdapDb({
      "com.br": "https://rdap.example.com.br/",
      br: REGISTRO_BR_SERVER,
    });

    await expect(
      lookupRdapServerForDomain(db, "rhamses.com.br")
    ).resolves.toEqual({
      tld: "com.br",
      rdap: "https://rdap.example.com.br/",
    });
  });

  it("returns null when no suffix matches", async () => {
    await expect(
      lookupRdapServerForDomain(mockRdapDb({}), "rhamses.com.br")
    ).resolves.toBeNull();
  });
});

describe("buildRdapOrgFallbackUrl", () => {
  it("falls back to rdap.org", () => {
    expect(buildRdapOrgFallbackUrl("rhamses.com.br")).toBe(
      "https://rdap.org/domain/rhamses.com.br"
    );
  });
});
