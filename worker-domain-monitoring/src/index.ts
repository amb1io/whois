interface Env {
  domain_monitor: D1Database;
  MAILERSEND_API_URL?: string;
  MAILERSEND_API_KEY?: string;
  NOTIFICATION_FROM_EMAIL?: string;
  NOTIFICATION_FROM_NAME?: string;
  FIXED_RECIPIENT_EMAIL?: string;
  WEB_PUSH_VAPID_PUBLIC_KEY?: string;
  WEB_PUSH_VAPID_PRIVATE_KEY?: string;
  WEB_PUSH_VAPID_SUBJECT?: string;
  WEB_PUSH_TTL_SECONDS?: string;
}

type NotificationRow = {
  email: string;
  domain: string;
  expires_at: string;
  endpoint: string | null;
  auth: string | null;
  p256dh: string | null;
};

type NotificationItem = {
  domain: string;
  expiresAt: Date;
};

type PushCredential = {
  endpoint: string;
  auth: string;
  p256dh: string;
};

type VapidConfig = {
  publicKey: string;
  privateKey: string;
  subject: string;
  ttl: number;
};

const REMINDER_OFFSET_DAYS = 7;

const SELECT_EXPIRING_DOMAINS = `
  SELECT
    u.email AS email,
    d.domain AS domain,
    d.expires_at AS expires_at,
    s.endpoint AS endpoint,
    s.auth AS auth,
    s.p256dh AS p256dh
  FROM subscriptions s
  INNER JOIN users u ON u.id = s.user_id
  INNER JOIN domains d ON d.id = s.domain_id
  WHERE s.notify_expiry = 1
    AND d.expires_at IS NOT NULL
    AND d.expires_at >= ?
    AND d.expires_at < ?;
`;

export default {
  async scheduled(_event: ScheduledEvent, env: Env, ctx: ExecutionContext) {
    ctx.waitUntil(handleScheduled(env));
  },
  async fetch(_request: Request, env: Env): Promise<Response> {
    const [rangeStart] = dayRangeUTC(REMINDER_OFFSET_DAYS);
    return new Response(
      JSON.stringify({
        ok: true,
        message: `Domain monitoring worker is ready for ${REMINDER_OFFSET_DAYS}-day reminders.`,
        sampleWindow: rangeStart.toISOString().slice(0, 10),
        mailerSendConfigured: Boolean(
          env.MAILERSEND_API_URL && env.MAILERSEND_API_KEY
        ),
        forcedRecipient: env.FIXED_RECIPIENT_EMAIL ?? null,
        reminderOffsetDays: REMINDER_OFFSET_DAYS,
      }),
      {
        status: 200,
        headers: { "Content-Type": "application/json" },
      }
    );
  },
};

async function handleScheduled(env: Env): Promise<void> {
  try {
    const [rangeStart, rangeEnd] = dayRangeUTC(REMINDER_OFFSET_DAYS);
    const { results } = await env.domain_monitor
      .prepare(SELECT_EXPIRING_DOMAINS)
      .bind(rangeStart.toISOString(), rangeEnd.toISOString())
      .all<NotificationRow>();

    if (!results || results.length === 0) {
      const targetDate = rangeStart.toISOString().slice(0, 10);
      console.log(
        `[monitor] No domains expiring in ${REMINDER_OFFSET_DAYS} days (target date ${targetDate})`
      );
      return;
    }

    const forcedRecipient =
      env.FIXED_RECIPIENT_EMAIL?.trim().toLowerCase() ?? null;
    const grouped = groupByEmail(results, forcedRecipient);
    await Promise.allSettled(
      Array.from(grouped.entries()).map(([email, payload]) =>
        sendNotification(env, email, payload.domains, payload.pushes)
      )
    );
  } catch (error) {
    console.error("[monitor] Failed to process domain notifications:", error);
  }
}

function groupByEmail(
  rows: NotificationRow[],
  forcedRecipient: string | null
): Map<string, { domains: NotificationItem[]; pushes: PushCredential[] }> {
  const map = new Map<
    string,
    { domains: NotificationItem[]; pushes: PushCredential[] }
  >();
  for (const row of rows) {
    if ((!row.email && !forcedRecipient) || !row.domain || !row.expires_at)
      continue;
    const expiresAt = new Date(row.expires_at);
    if (Number.isNaN(expiresAt.valueOf())) continue;
    const key = forcedRecipient ?? row.email.toLowerCase();
    if (!key) continue;
    const bucket = map.get(key) ?? { domains: [], pushes: [] };
    bucket.domains.push({ domain: row.domain, expiresAt });
    if (row.endpoint && row.auth && row.p256dh) {
      const exists = bucket.pushes.some(
        (push) => push.endpoint === row.endpoint
      );
      if (!exists) {
        bucket.pushes.push({
          endpoint: row.endpoint,
          auth: row.auth,
          p256dh: row.p256dh,
        });
      }
    }
    map.set(key, bucket);
  }
  return map;
}

async function sendNotification(
  env: Env,
  email: string,
  domains: NotificationItem[],
  pushes: PushCredential[]
): Promise<void> {
  await Promise.allSettled([
    sendEmailNotification(env, email, domains),
    sendPushNotifications(env, domains, pushes),
  ]);
}

async function sendEmailNotification(
  env: Env,
  email: string,
  domains: NotificationItem[]
): Promise<void> {
  if (!env.MAILERSEND_API_URL || !env.MAILERSEND_API_KEY) {
    console.warn(
      "[monitor] MailerSend configuration missing; skipping email for",
      email
    );
    return;
  }

  const subject =
    domains.length === 1
      ? `Domain ${domains[0].domain} expires in ${REMINDER_OFFSET_DAYS} days`
      : `${domains.length} domains expire in ${REMINDER_OFFSET_DAYS} days`;

  const html = buildEmailTemplate(email, domains);
  const payload = {
    from: {
      email: env.NOTIFICATION_FROM_EMAIL ?? "no-reply@notifications.example",
      name: env.NOTIFICATION_FROM_NAME ?? "Domain Alert",
    },
    to: [{ email }],
    subject,
    html,
  };

  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    Authorization: `Bearer ${env.MAILERSEND_API_KEY}`,
  };

  try {
    const response = await fetch(env.MAILERSEND_API_URL, {
      method: "POST",
      headers,
      body: JSON.stringify(payload),
    });

    if (!response.ok) {
      const text = await safeReadText(response);
      console.error(
        "[monitor] Email service responded with",
        response.status,
        text
      );
    } else {
      console.log(
        `[monitor] Notification sent to ${email} for ${domains.length} domain(s).`
      );
    }
  } catch (error) {
    console.error("[monitor] Failed to call email service for", email, error);
  }
}

async function sendPushNotifications(
  env: Env,
  domains: NotificationItem[],
  pushes: PushCredential[]
): Promise<void> {
  if (pushes.length === 0) {
    console.log(
      "[monitor] No push subscriptions available for",
      domains.map((d) => d.domain).join(", ")
    );
    return;
  }

  if (
    !env.WEB_PUSH_VAPID_PUBLIC_KEY ||
    !env.WEB_PUSH_VAPID_PRIVATE_KEY ||
    !env.WEB_PUSH_VAPID_SUBJECT
  ) {
    console.warn(
      "[monitor] VAPID configuration missing; skipping push notifications."
    );
    return;
  }

  console.log("[monitor] Sending push to", pushes.length, "endpoints");

  const vapidConfig: VapidConfig = {
    publicKey: env.WEB_PUSH_VAPID_PUBLIC_KEY,
    privateKey: env.WEB_PUSH_VAPID_PRIVATE_KEY,
    subject: env.WEB_PUSH_VAPID_SUBJECT,
    ttl: parseInt(env.WEB_PUSH_TTL_SECONDS ?? "", 10) || 2419200,
  };

  const title =
    domains.length === 1
      ? `Domain ${domains[0].domain} expires in ${REMINDER_OFFSET_DAYS} days`
      : `${domains.length} domains expire in ${REMINDER_OFFSET_DAYS} days`;
  const body =
    domains.length === 1
      ? `Domain ${domains[0].domain} expires in ${REMINDER_OFFSET_DAYS} days. Tap to review.`
      : `${domains.length} domains expire in ${REMINDER_OFFSET_DAYS} days. Tap to review.`;

  const payload = {
    title,
    body,
    data: {
      domains: domains.map((item) => ({
        domain: item.domain,
        expiresAt: item.expiresAt.toISOString(),
      })),
    },
  };

  await Promise.allSettled(
    pushes.map(async (push) => {
      try {
        const request = await buildWebPushRequest(push, payload, vapidConfig);
        const response = await fetch(push.endpoint, request);

        if (!response.ok) {
          const text = await safeReadText(response);
          console.error(
            "[monitor] Push service responded with",
            response.status,
            text
          );
        } else {
          console.log(
            `[monitor] Push notification queued for endpoint ${push.endpoint}`
          );
        }
      } catch (error) {
        console.error("[monitor] Failed to send push notification", error);
      }
    })
  );
}

async function buildWebPushRequest(
  push: PushCredential,
  payload: Record<string, unknown>,
  config: VapidConfig
): Promise<RequestInit> {
  const payloadBytes = new TextEncoder().encode(JSON.stringify(payload));
  const encryptedBody = await encryptPushPayload(push, payloadBytes);
  const audience = deriveAudience(push.endpoint);
  const jwt = await createVapidJwt(audience, config);

  const headers: Record<string, string> = {
    TTL: String(config.ttl),
    "Content-Encoding": "aes128gcm",
    "Content-Type": "application/octet-stream",
    Authorization: `vapid t=${jwt}, k=${config.publicKey}`,
  };

  return {
    method: "POST",
    headers,
    body: encryptedBody,
  };
}

async function createVapidJwt(
  audience: string,
  config: VapidConfig
): Promise<string> {
  const now = Math.floor(Date.now() / 1000);
  const expiration = now + 12 * 60 * 60;

  const header = {
    typ: "JWT",
    alg: "ES256",
  };
  const payload = {
    aud: audience,
    exp: expiration,
    sub: config.subject,
  };

  const encodedHeader = encodeBase64Url(
    new TextEncoder().encode(JSON.stringify(header))
  );
  const encodedPayload = encodeBase64Url(
    new TextEncoder().encode(JSON.stringify(payload))
  );
  const signingInput = `${encodedHeader}.${encodedPayload}`;

  const vapidKeys = await importVapidKeys(config.publicKey, config.privateKey);
  const signature = await crypto.subtle.sign(
    { name: "ECDSA", hash: "SHA-256" },
    vapidKeys.privateKey,
    new TextEncoder().encode(signingInput)
  );

  const encodedSignature = encodeBase64Url(new Uint8Array(signature));
  return `${signingInput}.${encodedSignature}`;
}

async function encryptPushPayload(
  push: PushCredential,
  payload: Uint8Array
): Promise<Uint8Array> {
  const authSecret = decodeBase64Url(push.auth);
  if (authSecret.length < 16) {
    throw new Error("Invalid push auth secret; expected at least 16 bytes.");
  }

  const userPublicKey = decodeBase64Url(push.p256dh);
  if (userPublicKey.length !== 65 || userPublicKey[0] !== 0x04) {
    throw new Error(
      "Invalid push public key; expected uncompressed P-256 key."
    );
  }

  const salt = crypto.getRandomValues(new Uint8Array(16));
  const receiverKey = await crypto.subtle.importKey(
    "raw",
    userPublicKey,
    { name: "ECDH", namedCurve: "P-256" },
    false,
    []
  );

  const senderKeys = await crypto.subtle.generateKey(
    { name: "ECDH", namedCurve: "P-256" },
    true,
    ["deriveBits"]
  );
  const senderPublicKey = new Uint8Array(
    await crypto.subtle.exportKey("raw", senderKeys.publicKey)
  );

  const sharedSecret = new Uint8Array(
    await crypto.subtle.deriveBits(
      {
        name: "ECDH",
        public: receiverKey,
      },
      senderKeys.privateKey,
      256
    )
  );

  const context = concatUint8Arrays(
    new TextEncoder().encode("WebPush: info\0"),
    userPublicKey,
    senderPublicKey
  );

  const ikm = await hkdf(authSecret, sharedSecret, context, 32);
  const prk = await hkdfExtract(salt, ikm);
  const contentEncryptionKey = await hkdfExpand(
    prk,
    new TextEncoder().encode("Content-Encoding: aes128gcm\0"),
    16
  );
  const nonce = await hkdfExpand(
    prk,
    new TextEncoder().encode("Content-Encoding: nonce\0"),
    12
  );

  const plaintext = new Uint8Array(payload.length + 1);
  plaintext.set(payload, 0);
  plaintext[plaintext.length - 1] = 2;

  const aesKey = await crypto.subtle.importKey(
    "raw",
    contentEncryptionKey,
    { name: "AES-GCM" },
    false,
    ["encrypt"]
  );

  const ciphertext = new Uint8Array(
    await crypto.subtle.encrypt(
      {
        name: "AES-GCM",
        iv: nonce,
      },
      aesKey,
      plaintext
    )
  );

  const rs = 4096;
  const rsBytes = new Uint8Array(4);
  new DataView(rsBytes.buffer).setUint32(0, rs);

  const body = new Uint8Array(
    16 + 4 + 1 + senderPublicKey.length + ciphertext.length
  );
  let offset = 0;
  body.set(salt, offset);
  offset += salt.length;
  body.set(rsBytes, offset);
  offset += rsBytes.length;
  body[offset] = senderPublicKey.length;
  offset += 1;
  body.set(senderPublicKey, offset);
  offset += senderPublicKey.length;
  body.set(ciphertext, offset);

  return body;
}

async function importVapidKeys(
  publicKeyBase64: string,
  privateKeyBase64: string
): Promise<{ privateKey: CryptoKey; publicKey: Uint8Array }> {
  const publicKey = decodeBase64Url(publicKeyBase64);
  if (publicKey.length !== 65 || publicKey[0] !== 0x04) {
    throw new Error("VAPID public key must be a 65-byte uncompressed point.");
  }

  const privateKeyBytes = decodeBase64Url(privateKeyBase64);
  if (privateKeyBytes.length !== 32) {
    throw new Error("VAPID private key must be 32 bytes.");
  }

  const jwk: JsonWebKey = {
    kty: "EC",
    crv: "P-256",
    x: encodeBase64Url(publicKey.slice(1, 33)),
    y: encodeBase64Url(publicKey.slice(33, 65)),
    d: encodeBase64Url(privateKeyBytes),
    ext: true,
  };

  const privateKey = await crypto.subtle.importKey(
    "jwk",
    jwk,
    { name: "ECDSA", namedCurve: "P-256" },
    false,
    ["sign"]
  );

  return { privateKey, publicKey };
}

function deriveAudience(endpoint: string): string {
  const url = new URL(endpoint);
  return `${url.protocol}//${url.host}`;
}

async function hkdf(
  salt: Uint8Array,
  ikm: Uint8Array,
  info: Uint8Array,
  length: number
): Promise<Uint8Array> {
  const prk = await hkdfExtract(salt, ikm);
  return hkdfExpand(prk, info, length);
}

async function hkdfExtract(
  salt: Uint8Array,
  ikm: Uint8Array
): Promise<Uint8Array> {
  const key = await crypto.subtle.importKey(
    "raw",
    salt,
    {
      name: "HMAC",
      hash: "SHA-256",
    },
    false,
    ["sign"]
  );
  const signature = await crypto.subtle.sign("HMAC", key, ikm);
  return new Uint8Array(signature);
}

async function hkdfExpand(
  prk: Uint8Array,
  info: Uint8Array,
  length: number
): Promise<Uint8Array> {
  const blocks = Math.ceil(length / 32);
  let output = new Uint8Array(0);
  let previous = new Uint8Array(0);

  for (let i = 0; i < blocks; i++) {
    const input = concatUint8Arrays(previous, info, new Uint8Array([i + 1]));
    const key = await crypto.subtle.importKey(
      "raw",
      prk,
      { name: "HMAC", hash: "SHA-256" },
      false,
      ["sign"]
    );
    const block = new Uint8Array(await crypto.subtle.sign("HMAC", key, input));
    output = concatUint8Arrays(output, block);
    previous = block;
  }

  return output.slice(0, length);
}

function concatUint8Arrays(...chunks: Uint8Array[]): Uint8Array {
  const total = chunks.reduce((sum, chunk) => sum + chunk.length, 0);
  const result = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    result.set(chunk, offset);
    offset += chunk.length;
  }
  return result;
}

function decodeBase64Url(value: string): Uint8Array {
  const normalized = value.replace(/-/g, "+").replace(/_/g, "/");
  const padding =
    normalized.length % 4 === 0 ? "" : "=".repeat(4 - (normalized.length % 4));
  const base64 = normalized + padding;
  if (typeof atob === "function") {
    const binary = atob(base64);
    const output = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) {
      output[i] = binary.charCodeAt(i);
    }
    return output;
  }
  const nodeBuffer = (
    globalThis as {
      Buffer?: {
        from: (
          input: string,
          encoding: string
        ) => { buffer: ArrayBuffer; byteOffset: number; byteLength: number };
      };
    }
  ).Buffer;
  if (nodeBuffer) {
    const buffer = nodeBuffer.from(base64, "base64");
    return new Uint8Array(buffer.buffer, buffer.byteOffset, buffer.byteLength);
  }
  throw new Error("No base64 decoder available in current environment.");
}

function encodeBase64Url(value: Uint8Array): string {
  let binary = "";
  for (let i = 0; i < value.length; i++) {
    binary += String.fromCharCode(value[i]);
  }
  let base64: string;
  if (typeof btoa === "function") {
    base64 = btoa(binary);
  } else {
    const nodeBuffer = (
      globalThis as {
        Buffer?: {
          from: (
            input: string,
            encoding: string
          ) => { toString: (encoding: string) => string };
        };
      }
    ).Buffer;
    if (!nodeBuffer) {
      throw new Error("No base64 encoder available in current environment.");
    }
    base64 = nodeBuffer.from(binary, "binary").toString("base64");
  }
  return base64.replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/u, "");
}

function buildEmailTemplate(
  email: string,
  domains: NotificationItem[]
): string {
  const rows = domains
    .map(
      (item) => `
        <tr>
          <td style="padding: 12px 16px; border-bottom: 1px solid #e2e8f0; font-family: Inter, Arial, sans-serif; font-size: 14px; color: #0f172a;">
            ${escapeHtml(item.domain)}
          </td>
          <td style="padding: 12px 16px; border-bottom: 1px solid #e2e8f0; font-family: Inter, Arial, sans-serif; font-size: 14px; color: #0f172a;">
            ${formatDate(item.expiresAt)}
          </td>
        </tr>
      `
    )
    .join("");

  return `<!DOCTYPE html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <title>Domain expiry reminder</title>
  </head>
  <body style="margin:0; padding:0; background-color:#f8fafc;">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background-color:#f8fafc; padding:40px 0;">
      <tr>
        <td align="center">
          <table width="600" cellpadding="0" cellspacing="0" style="background:#ffffff; border-radius:12px; overflow:hidden; box-shadow:0 10px 30px rgba(15,23,42,0.08);">
            <tr>
              <td style="padding:32px; font-family:Inter, Arial, sans-serif;">
                <h1 style="margin:0 0 16px; font-size:22px; color:#0f172a; font-weight:600;">Domain expiry reminder</h1>
                <p style="margin:0 0 24px; font-size:15px; color:#334155; line-height:1.6;">
                  Hello ${escapeHtml(email)},<br />
                  The following domain${
                    domains.length > 1 ? "s" : ""
                  } you monitor ${
    domains.length > 1 ? "are" : "is"
  } scheduled to expire in ${REMINDER_OFFSET_DAYS} days.
                </p>
                <table width="100%" cellpadding="0" cellspacing="0" style="border:1px solid #e2e8f0; border-radius:10px; overflow:hidden;">
                  <thead style="background-color:#eff6ff;">
                    <tr>
                      <th align="left" style="padding:12px 16px; font-family:Inter, Arial, sans-serif; font-size:12px; text-transform:uppercase; letter-spacing:0.08em; color:#1d4ed8;">Domain</th>
                      <th align="left" style="padding:12px 16px; font-family:Inter, Arial, sans-serif; font-size:12px; text-transform:uppercase; letter-spacing:0.08em; color:#1d4ed8;">Expires on</th>
                    </tr>
                  </thead>
                  <tbody>${rows}</tbody>
                </table>
                <p style="margin:24px 0 0; font-size:14px; color:#64748b; line-height:1.6;">
                  Please renew the${domains.length > 1 ? "se" : ""} domain${
    domains.length > 1 ? "s" : ""
  } as soon as possible to avoid service interruptions or losing ownership.
                </p>
                <p style="margin:24px 0 0; font-size:12px; color:#94a3b8;">You are receiving this email because you requested alerts for these domains.</p>
              </td>
            </tr>
          </table>
        </td>
      </tr>
    </table>
  </body>
</html>`;
}

function dayRangeUTC(offsetDays = 0): [Date, Date] {
  const now = new Date();
  const start = new Date(
    Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate())
  );
  start.setUTCDate(start.getUTCDate() + offsetDays);
  const end = new Date(start);
  end.setUTCDate(end.getUTCDate() + 1);
  return [start, end];
}

function formatDate(date: Date): string {
  return date.toLocaleDateString("en-US", {
    year: "numeric",
    month: "long",
    day: "numeric",
    timeZone: "UTC",
  });
}

function escapeHtml(value: string): string {
  return value.replace(/[&<>"]+/g, (char) => {
    switch (char) {
      case "&":
        return "&amp;";
      case "<":
        return "&lt;";
      case ">":
        return "&gt;";
      case '"':
        return "&quot;";
      default:
        return char;
    }
  });
}

async function safeReadText(response: Response): Promise<string> {
  try {
    return await response.text();
  } catch (error) {
    console.warn("[monitor] Failed to read error response body", error);
    return "<unavailable>";
  }
}
