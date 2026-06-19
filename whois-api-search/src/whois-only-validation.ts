import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import net from "node:net";
import { extractWhoisEventDates } from "./parse-whois-dates";
import { parseWhoisHost } from "./whois-host";
import { resolveLookupMethod } from "./server";
import whoisOnlyTlds from "./fixtures/whois-only-tlds.json";

const SERVERS_DIR = resolve(import.meta.dirname, "../../scrapper/servers");
const DEFAULT_QUERY_TIMEOUT_MS = 20_000;
const IDLE_CLOSE_MS = 2_000;

export interface WhoisOnlyTldConfig {
  tld: string;
  whois: string;
  rdap: string;
}

export function loadWhoisOnlyTldConfig(tld: string): WhoisOnlyTldConfig {
  const filePath = resolve(SERVERS_DIR, `${tld}.json`);
  const data = JSON.parse(readFileSync(filePath, "utf8")) as WhoisOnlyTldConfig;
  return {
    tld: data.tld,
    whois: (data.whois ?? "").trim(),
    rdap: (data.rdap ?? "").trim(),
  };
}

export function exampleDomainForTld(tld: string): string {
  return `example.${tld}`;
}

export function whoisQueryForTld(tld: string): string {
  return exampleDomainForTld(tld);
}

export function fetchWhoisOverTcp(
  whoisServer: string,
  domain: string,
  timeoutMs = DEFAULT_QUERY_TIMEOUT_MS
): Promise<string> {
  const { hostname, port } = parseWhoisHost(whoisServer);

  return new Promise((resolvePromise, reject) => {
    const socket = net.createConnection({ host: hostname, port, family: 4 });
    let body = "";
    let settled = false;
    let idleTimer: ReturnType<typeof setTimeout> | null = null;

    const finish = (error?: Error) => {
      if (settled) {
        return;
      }
      settled = true;
      if (idleTimer) {
        clearTimeout(idleTimer);
      }
      clearTimeout(maxTimer);
      socket.destroy();

      if (error) {
        reject(error);
        return;
      }

      const trimmed = body.trim();
      if (!trimmed) {
        reject(new Error("Empty WHOIS response"));
        return;
      }

      resolvePromise(trimmed);
    };

    const scheduleIdleClose = () => {
      if (idleTimer) {
        clearTimeout(idleTimer);
      }
      idleTimer = setTimeout(() => finish(), IDLE_CLOSE_MS);
    };

    const maxTimer = setTimeout(() => {
      finish(new Error(`WHOIS query timed out after ${timeoutMs}ms`));
    }, timeoutMs);

    socket.setEncoding("utf8");
    socket.on("connect", () => {
      socket.write(`${domain}\r\n`);
    });
    socket.on("data", (chunk) => {
      body += chunk;
      scheduleIdleClose();
    });
    socket.on("error", (error) => finish(error));
    socket.on("end", () => finish());
    socket.on("close", () => {
      if (!settled) {
        finish();
      }
    });
  });
}

export async function fetchWhoisOverTcpWithRetry(
  whoisServer: string,
  domain: string,
  timeoutMs = DEFAULT_QUERY_TIMEOUT_MS
): Promise<string> {
  try {
    return await fetchWhoisOverTcp(whoisServer, domain, timeoutMs);
  } catch (firstError) {
    try {
      return await fetchWhoisOverTcp(whoisServer, domain, timeoutMs);
    } catch {
      throw firstError;
    }
  }
}

export interface WhoisOnlyValidationResult {
  tld: string;
  domain: string;
  whoisServer: string;
  responseBytes: number;
  updatedDate: string | null;
  expiryDate: string | null;
}

export async function validateWhoisOnlyTld(
  tld: string
): Promise<WhoisOnlyValidationResult> {
  const config = loadWhoisOnlyTldConfig(tld);
  if (config.rdap) {
    throw new Error(`Expected whois-only TLD, but rdap is configured for .${tld}`);
  }
  if (!config.whois) {
    throw new Error(`Missing whois server for .${tld}`);
  }
  if (resolveLookupMethod(config) !== "whois") {
    throw new Error(`Expected lookup method "whois" for .${tld}`);
  }

  const domain = whoisQueryForTld(tld);
  const whoisText = await fetchWhoisOverTcpWithRetry(config.whois, domain);
  const { expiringDate, lastChanged } = extractWhoisEventDates(whoisText);

  return {
    tld,
    domain,
    whoisServer: config.whois,
    responseBytes: whoisText.length,
    updatedDate: lastChanged,
    expiryDate: expiringDate,
  };
}

export { whoisOnlyTlds };
