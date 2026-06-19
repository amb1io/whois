import { describe, expect, it } from "vitest";
import {
  extractWhoisEventDates,
  normalizeWhoisDate,
} from "./parse-whois-dates";

describe("normalizeWhoisDate", () => {
  it("parses ISO timestamps", () => {
    expect(normalizeWhoisDate("2024-03-15T10:00:00Z")).toBe(
      "2024-03-15T10:00:00.000Z"
    );
  });

  it("parses YYYYMMDD values", () => {
    expect(normalizeWhoisDate("20240315")).toBe("2024-03-15T00:00:00.000Z");
  });
});

describe("extractWhoisEventDates", () => {
  it("parses Verisign-style labels", () => {
    const whoisText = [
      "Domain Name: EXAMPLE.COM",
      "Updated Date: 2024-03-15T10:00:00Z",
      "Registry Expiry Date: 2026-01-01T10:00:00Z",
    ].join("\n");

    expect(extractWhoisEventDates(whoisText)).toEqual({
      lastChanged: "2024-03-15T10:00:00.000Z",
      expiringDate: "2026-01-01T10:00:00.000Z",
    });
  });

  it("parses registro.br-style labels", () => {
    const whoisText = [
      "domain:      example.com.br",
      "created:     20200101",
      "expires:     20260101",
      "changed:     20240315",
    ].join("\n");

    expect(extractWhoisEventDates(whoisText)).toEqual({
      lastChanged: "2024-03-15T00:00:00.000Z",
      expiringDate: "2026-01-01T00:00:00.000Z",
    });
  });

  it("parses Expiry Date label", () => {
    const whoisText = [
      "Updated Date: 2024-01-02",
      "Expiry Date: 2027-05-10",
    ].join("\n");

    expect(extractWhoisEventDates(whoisText)).toEqual({
      lastChanged: "2024-01-02T00:00:00.000Z",
      expiringDate: "2027-05-10T00:00:00.000Z",
    });
  });
});
