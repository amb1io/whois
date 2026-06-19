import { describe, expect, it } from "vitest";
import {
  buildRdapUrl,
  treatRdapResponse,
} from "./rdap";
import {
  lookupServerForDomain,
  resolveLookupMethod,
  type ServerRecord,
} from "./server";
import { parseWhoisHost } from "./whois-host";
import { tldCandidates } from "./tld";

const REGISTRO_BR_SERVER = "https://rdap.registro.br/";

function mockServerDb(servers: Record<string, Partial<ServerRecord>>): D1Database {
  return {
    prepare: (_sql: string) => ({
      bind: (tld: string) => ({
        first: async () => {
          const server = servers[tld];
          if (!server) {
            return null;
          }

          return {
            tld,
            rdap: server.rdap ?? "",
            whois: server.whois ?? "",
          };
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

describe("lookupServerForDomain", () => {
  const brOnlyDb = mockServerDb({
    br: { rdap: REGISTRO_BR_SERVER, whois: "whois.registro.br" },
  });

  it.each(["rhamses.com.br", "tudopelanhl.com.br"])(
    "resolves %s via the br rdap_whois_server row",
    async (domain) => {
      await expect(lookupServerForDomain(brOnlyDb, domain)).resolves.toEqual({
        tld: "br",
        rdap: REGISTRO_BR_SERVER,
        whois: "whois.registro.br",
      });
    }
  );

  it("prefers a longer matching suffix when present", async () => {
    const db = mockServerDb({
      "com.br": {
        rdap: "https://rdap.example.com.br/",
        whois: "whois.example.com.br",
      },
      br: { rdap: REGISTRO_BR_SERVER, whois: "whois.registro.br" },
    });

    await expect(lookupServerForDomain(db, "rhamses.com.br")).resolves.toEqual({
      tld: "com.br",
      rdap: "https://rdap.example.com.br/",
      whois: "whois.example.com.br",
    });
  });

  it("returns a whois-only row when rdap is empty", async () => {
    const db = mockServerDb({
      de: { rdap: "", whois: "whois.denic.de" },
    });

    await expect(lookupServerForDomain(db, "example.de")).resolves.toEqual({
      tld: "de",
      rdap: "",
      whois: "whois.denic.de",
    });
  });

  it("returns null when no suffix matches", async () => {
    await expect(
      lookupServerForDomain(mockServerDb({}), "rhamses.com.br")
    ).resolves.toBeNull();
  });
});

describe("resolveLookupMethod", () => {
  it("prefers rdap when both are present", () => {
    expect(
      resolveLookupMethod({
        tld: "br",
        rdap: REGISTRO_BR_SERVER,
        whois: "whois.registro.br",
      })
    ).toBe("rdap");
  });

  it("uses whois when rdap is empty", () => {
    expect(
      resolveLookupMethod({
        tld: "de",
        rdap: "",
        whois: "whois.denic.de",
      })
    ).toBe("whois");
  });

  it("returns null when both are empty", () => {
    expect(
      resolveLookupMethod({
        tld: "test",
        rdap: "",
        whois: "",
      })
    ).toBeNull();
  });
});

describe("parseWhoisHost", () => {
  it("parses plain hostnames", () => {
    expect(parseWhoisHost("whois.registro.br")).toEqual({
      hostname: "whois.registro.br",
      port: 43,
    });
  });

  it("parses URLs with a protocol", () => {
    expect(parseWhoisHost("https://whois.sr/rdap/")).toEqual({
      hostname: "whois.sr",
      port: 43,
    });
  });
});

describe("treatRdapResponse", () => {
  it("accepts domain objects with ldhName", () => {
    expect(treatRdapResponse({ ldhName: "example.com" })).toEqual({
      ldhName: "example.com",
    });
  });
});
