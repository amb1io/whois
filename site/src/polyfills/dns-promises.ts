type Resolve4 = (hostname: string) => Promise<string[]>;

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
  const addresses = await fetchDnsRecords(hostname);
  return addresses.length > 0 ? addresses : [hostname];
};
