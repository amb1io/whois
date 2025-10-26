import { whois } from "@cleandns/whois-rdap";

const JSON_HEADERS = {
  "Content-Type": "application/json; charset=utf-8",
};

const isPort43UnsupportedError = (value) =>
  typeof value === "string" && value.toLowerCase().includes("net.socket");

const sanitizeString = (value) => {
  if (value === null || value === undefined) return null;
  const str = String(value).trim();
  return str.length === 0 ? null : str;
};

const extractVCardValue = (vcardArray, keys) => {
  const entries = Array.isArray(vcardArray?.[1]) ? vcardArray[1] : [];
  for (const entry of entries) {
    if (!Array.isArray(entry) || typeof entry[0] !== "string") continue;
    if (keys.includes(entry[0])) {
      const val = Array.isArray(entry[3]) ? entry[3][0] : entry[3];
      return sanitizeString(val);
    }
  }
  return null;
};

const parseRdapEvents = (events) => {
  const findDate = (action) => {
    const event = events?.find((item) => item?.eventAction === action);
    if (!event?.eventDate) return null;
    const date = new Date(event.eventDate);
    return Number.isNaN(date.valueOf()) ? null : date;
  };

  return {
    created: findDate("registration") ?? findDate("create"),
    updated:
      findDate("last changed") ??
      findDate("last update of RDAP database") ??
      findDate("update"),
    expires: findDate("expiration") ?? findDate("expiry") ?? findDate("expire"),
  };
};

const buildRegistrarFromEntity = (entity) => {
  if (!entity) {
    return { id: 0, name: null, email: null };
  }

  const publicIds = Array.isArray(entity.publicIds)
    ? entity.publicIds
    : entity.publicIDs ?? [];
  const registrarId =
    publicIds
      ?.map((item) => item?.identifier ?? item?.Identifier)
      ?.find((item) => typeof item === "string" && item.trim().length > 0) ?? null;

  const name =
    extractVCardValue(entity.vcardArray, ["fn", "org"]) ??
    sanitizeString(entity.handle);
  const email = extractVCardValue(entity.vcardArray, ["email"]);

  return {
    id: registrarId ? String(registrarId) : 0,
    name,
    email,
  };
};

const parseRdapResponse = (data) => {
  if (!data || typeof data !== "object") return null;

  const entities = Array.isArray(data.entities) ? data.entities : [];
  const registrarEntity = entities.find(
    (entity) => Array.isArray(entity?.roles) && entity.roles.includes("registrar")
  );
  const resellerEntity = entities.find(
    (entity) => Array.isArray(entity?.roles) && entity.roles.includes("reseller")
  );

  const registrar = buildRegistrarFromEntity(registrarEntity);
  const reseller =
    extractVCardValue(resellerEntity?.vcardArray, ["fn", "org"]) ??
    sanitizeString(resellerEntity?.handle);

  const statuses = Array.isArray(data.status)
    ? data.status.map((status) => String(status).toLowerCase())
    : [];

  const nameservers = Array.isArray(data.nameservers)
    ? data.nameservers
        .map((ns) => sanitizeString(ns?.ldhName ?? ns?.handle))
        .filter((value) => Boolean(value))
    : [];

  const timestamps = parseRdapEvents(
    Array.isArray(data.events) ? data.events : []
  );

  return {
    found: true,
    statusCode: 200,
    error: "",
    registrar,
    reseller,
    status: statuses,
    statusDelta: [],
    nameservers,
    ts: timestamps,
    server: sanitizeString(data.port43) ?? null,
  };
};

const rdapFallbackHosts = (domain, whoisServer) => {
  const hosts = new Set();

  if (whoisServer && whoisServer.startsWith("whois.")) {
    const stripped = whoisServer.replace(/^whois\./, "");
    hosts.add(`https://rdap.${stripped}/domain/${encodeURIComponent(domain)}`);
    hosts.add(
      `https://${whoisServer.replace(
        /^whois\./,
        "rdap."
      )}/domain/${encodeURIComponent(domain)}`
    );
  }

  const tld = domain.split(".").pop();
  if (tld) {
    hosts.add(`https://rdap.${tld}/domain/${encodeURIComponent(domain)}`);
  }

  hosts.add(`https://rdap.org/domain/${encodeURIComponent(domain)}`);

  return Array.from(hosts);
};

const fetchRdapFallback = async (domain, whoisServer) => {
  for (const url of rdapFallbackHosts(domain, whoisServer)) {
    try {
      const res = await fetch(url, {
        headers: {
          accept: "application/rdap+json, application/json;q=0.8, */*;q=0.5",
        },
      });

      if (!res.ok) continue;

      const data = await res.json();
      const parsed = parseRdapResponse(data);
      if (parsed) {
        return parsed;
      }
    } catch (error) {
      console.warn(`RDAP fallback failed for ${url}:`, error);
    }
  }

  return null;
};

const performWhoisLookup = async (domain) => {
  try {
    const result = await whois(domain);

    if (result?.error && isPort43UnsupportedError(result.error)) {
      const fallback = await fetchRdapFallback(domain, result.server ?? null);
      return fallback ?? result;
    }

    return result;
  } catch (error) {
    if (error && isPort43UnsupportedError(error.message ?? "")) {
      const fallback = await fetchRdapFallback(domain, null);
      if (fallback) {
        return fallback;
      }
    }

    throw error;
  }
};

const extractDomain = (event) => {
  const attempt = (...values) =>
    values
      .map((value) => sanitizeString(value))
      .find((value) => value !== null);

  let domain =
    attempt(event?.queryStringParameters?.domain) ??
    attempt(event?.pathParameters?.domain);

  if (!domain && event?.body) {
    try {
      if (event.isBase64Encoded) {
        const decoded = Buffer.from(event.body, "base64").toString("utf8");
        const parsed = JSON.parse(decoded);
        domain = attempt(parsed?.domain);
      } else if (event.headers?.["content-type"]?.includes("application/json")) {
        const parsed = JSON.parse(event.body);
        domain = attempt(parsed?.domain);
      } else {
        domain = attempt(event.body);
      }
    } catch {
      /* swallow */
    }
  }

  return domain ?? "";
};

export const handler = async (event) => {
  const domain = extractDomain(event);

  if (!domain) {
    return {
      statusCode: 400,
      headers: JSON_HEADERS,
      body: JSON.stringify({ error: "Domain parameter is required." }),
    };
  }

  try {
    const lookupResult = await performWhoisLookup(domain);

    if (lookupResult?.error && isPort43UnsupportedError(lookupResult.error)) {
      return {
        statusCode: 502,
        headers: JSON_HEADERS,
        body: JSON.stringify({
          error:
            "The registry for this domain only provides legacy WHOIS over port 43, which is not supported in this environment.",
          details: lookupResult,
        }),
      };
    }

    return {
      statusCode: 200,
      headers: JSON_HEADERS,
      body: JSON.stringify(lookupResult),
    };
  } catch (error) {
    console.error("Lambda WHOIS lookup failed:", error);
    return {
      statusCode: 502,
      headers: JSON_HEADERS,
      body: JSON.stringify({
        error: "Unable to complete WHOIS lookup. Please try again later.",
      }),
    };
  }
};
