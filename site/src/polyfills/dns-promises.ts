type Resolve4 = (hostname: string) => Promise<string[]>;

let nodeResolve4: Resolve4 | null = null;

/* Attempt to use the Node implementation when available (e.g. local dev). */
if (typeof process !== "undefined" && process.versions?.node) {
  try {
    const dnsPromises = await import("node:dns/promises");
    nodeResolve4 = dnsPromises.resolve4.bind(dnsPromises) as Resolve4;
  } catch {
    nodeResolve4 = null;
  }
}

const fetchDnsRecords: Resolve4 = async (hostname) => {
  const url = `https://1.1.1.1/dns-query?name=${encodeURIComponent(hostname)}&type=A`;

  try {
    const res = await fetch(url, {
      headers: {
        accept: "application/dns-json",
      },
    });

    if (!res.ok) {
      return [];
    }

    const data = (await res.json()) as {
      Answer?: Array<{ data?: string; type?: number }>;
    };

    return (
      data.Answer?.filter((answer) => answer.type === 1 && typeof answer.data === "string").map(
        (answer) => answer.data!,
      ) ?? []
    );
  } catch {
    return [];
  }
};

export const resolve4: Resolve4 = async (hostname) => {
  if (nodeResolve4) {
    try {
      return await nodeResolve4(hostname);
    } catch {
      /* fall back to fetch-based resolution */
    }
  }

  return fetchDnsRecords(hostname);
};
