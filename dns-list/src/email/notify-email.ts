import { renderTemplate } from "./render-template";
import { sendNotifyEmail } from "./send-ses";

export type NotifyEmailReason = "last_changed" | "expiring";

export interface NotifyEmailRow {
  domain: string;
  notify_at: string;
}

function buildButtonUrl(frontendUrl: string, domain: string): string {
  const base = frontendUrl.replace(/\/$/, "");
  return `${base}?q=${encodeURIComponent(domain)}`;
}

function subjectForReason(reason: NotifyEmailReason, domain: string): string {
  if (reason === "expiring") {
    return `O domínio ${domain} expira hoje`;
  }
  return `O domínio ${domain} foi atualizado`;
}

function textBodyForReason(reason: NotifyEmailReason, domain: string): string {
  if (reason === "expiring") {
    return `O domínio ${domain} expira hoje. Acesse o link no e-mail para ver os detalhes atualizados.`;
  }
  return `O domínio ${domain} foi atualizado. Acesse o link no e-mail para saber mais.`;
}

export async function sendDomainNotifyEmail(
  env: Env,
  row: NotifyEmailRow,
  reason: NotifyEmailReason
): Promise<void> {
  const templateName = reason === "expiring" ? "expiring" : "updated";
  const buttonUrl = buildButtonUrl(env.FRONTEND_URL, row.domain);
  const html = renderTemplate(templateName, {
    domain: row.domain,
    buttonUrl,
    fromName: env.SES_FROM_NAME,
  });

  await sendNotifyEmail(env, {
    to: row.notify_at,
    subject: subjectForReason(reason, row.domain),
    html,
    text: textBodyForReason(reason, row.domain),
  });
}
