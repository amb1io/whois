import { describe, expect, it } from "vitest";
import { parseWhoisHost } from "./whois-host";

describe("parseWhoisHost", () => {
  it("parses hostnames with explicit ports", () => {
    expect(parseWhoisHost("whois.example.com:4343")).toEqual({
      hostname: "whois.example.com",
      port: 4343,
    });
  });
});
