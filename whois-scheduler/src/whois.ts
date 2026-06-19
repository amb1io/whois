import { connect } from "cloudflare:sockets";
import { parseWhoisHost } from "./whois-host";

const DEFAULT_TIMEOUT_MS = 20_000;
const IDLE_CLOSE_MS = 2_000;

export async function fetchWhois(
  whoisServer: string,
  domain: string,
  timeoutMs = DEFAULT_TIMEOUT_MS
): Promise<string> {
  const { hostname, port } = parseWhoisHost(whoisServer);
  const socket = connect({ hostname, port });
  const writer = socket.writable.getWriter();
  const encoder = new TextEncoder();

  await writer.write(encoder.encode(`${domain}\r\n`));
  await writer.close();

  const reader = socket.readable.getReader();
  const decoder = new TextDecoder();
  let body = "";
  const startedAt = Date.now();

  try {
    while (Date.now() - startedAt < timeoutMs) {
      const idleMs = body.length > 0 ? IDLE_CLOSE_MS : timeoutMs;
      const result = await Promise.race([
        reader.read(),
        new Promise<ReadableStreamReadResult<Uint8Array>>((resolve) =>
          setTimeout(() => resolve({ done: true, value: undefined }), idleMs)
        ),
      ]);

      if (result.done) {
        break;
      }

      if (result.value) {
        body += decoder.decode(result.value, { stream: true });
      }
    }
  } finally {
    reader.releaseLock();
  }

  return body.trim();
}
