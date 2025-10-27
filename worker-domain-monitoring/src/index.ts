interface Env {
  domain_monitor: D1Database;
  MAILERSEND_API_URL?: string;
  MAILERSEND_API_KEY?: string;
  NOTIFICATION_FROM_EMAIL?: string;
  NOTIFICATION_FROM_NAME?: string;
  FIXED_RECIPIENT_EMAIL?: string;
}

type NotificationRow = {
  email: string;
  domain: string;
  expires_at: string;
};

type NotificationItem = {
  domain: string;
  expiresAt: Date;
};

const SELECT_EXPIRING_DOMAINS = `
  SELECT
    u.email AS email,
    d.domain AS domain,
    d.expires_at AS expires_at
  FROM user_domain_to_notify udn
  INNER JOIN users u ON u.id = udn.user_id
  INNER JOIN domains d ON d.id = udn.domain_id
  WHERE d.expires_at IS NOT NULL
    AND d.expires_at >= ?
    AND d.expires_at < ?;
`;

export default {
  async scheduled(_event: ScheduledEvent, env: Env, ctx: ExecutionContext) {
    ctx.waitUntil(handleScheduled(env));
  },
  async fetch(_request: Request, env: Env): Promise<Response> {
    const [rangeStart] = todayRangeUTC();
    return new Response(
      JSON.stringify({
        ok: true,
        message: "Domain monitoring worker is ready.",
        sampleWindow: rangeStart.toISOString().slice(0, 10),
        mailerSendConfigured: Boolean(env.MAILERSEND_API_URL && env.MAILERSEND_API_KEY),
        forcedRecipient: env.FIXED_RECIPIENT_EMAIL ?? null,
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
    const [rangeStart, rangeEnd] = todayRangeUTC();
    const { results } = await env.domain_monitor
      .prepare(SELECT_EXPIRING_DOMAINS)
      .bind(rangeStart.toISOString(), rangeEnd.toISOString())
      .all<NotificationRow>();

    if (!results || results.length === 0) {
      console.log("[monitor] No expiring domains found for", rangeStart.toISOString().slice(0, 10));
      return;
    }

    const forcedRecipient =
      env.FIXED_RECIPIENT_EMAIL?.trim().toLowerCase() ?? null;
    const grouped = groupByEmail(results, forcedRecipient);
    await Promise.allSettled(
      Array.from(grouped.entries()).map(([email, items]) => sendNotification(env, email, items))
    );
  } catch (error) {
    console.error("[monitor] Failed to process domain notifications:", error);
  }
}

function groupByEmail(
  rows: NotificationRow[],
  forcedRecipient: string | null
): Map<string, NotificationItem[]> {
  const map = new Map<string, NotificationItem[]>();
  for (const row of rows) {
    if ((!row.email && !forcedRecipient) || !row.domain || !row.expires_at) continue;
    const expiresAt = new Date(row.expires_at);
    if (Number.isNaN(expiresAt.valueOf())) continue;
    const key = forcedRecipient ?? row.email.toLowerCase();
    if (!key) continue;
    const items = map.get(key) ?? [];
    items.push({ domain: row.domain, expiresAt });
    map.set(key, items);
  }
  return map;
}

async function sendNotification(env: Env, email: string, domains: NotificationItem[]): Promise<void> {
  if (!env.MAILERSEND_API_URL || !env.MAILERSEND_API_KEY) {
    console.warn("[monitor] MailerSend configuration missing; skipping email for", email);
    return;
  }

  const subject = domains.length === 1
    ? `Domain ${domains[0].domain} expires today`
    : `Domain expiry reminder (${domains.length} domains)`;

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
      console.error("[monitor] Email service responded with", response.status, text);
    } else {
      console.log(`[monitor] Notification sent to ${email} for ${domains.length} domain(s).`);
    }
  } catch (error) {
    console.error("[monitor] Failed to call email service for", email, error);
  }
}

function buildEmailTemplate(email: string, domains: NotificationItem[]): string {
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
                  The following domain${domains.length > 1 ? "s" : ""} you monitor ${domains.length > 1 ? "are" : "is"} scheduled to expire today.
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
                  Please renew the${domains.length > 1 ? "se" : ""} domain${domains.length > 1 ? "s" : ""} as soon as possible to avoid service interruptions or losing ownership.
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

function todayRangeUTC(): [Date, Date] {
  const now = new Date();
  const start = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
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
