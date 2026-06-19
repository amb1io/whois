export function parseWhoisHost(whoisServer: string): {
  hostname: string;
  port: number;
} {
  const value = whoisServer.trim();
  if (!value) {
    throw new Error("empty whois server");
  }

  if (value.includes("://")) {
    const url = new URL(value);
    return {
      hostname: url.hostname,
      port: url.port ? Number(url.port) : 43,
    };
  }

  const hostname = value.split("/")[0]?.split(":")[0] ?? value;
  const portMatch = value.match(/:(\d+)$/);
  return {
    hostname,
    port: portMatch ? Number(portMatch[1]) : 43,
  };
}
