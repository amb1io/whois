import updatedHtml from "../../templates/domain-updated.html";
import expiringHtml from "../../templates/domain-expiring.html";

const templates = {
  updated: updatedHtml,
  expiring: expiringHtml,
} as const;

export type EmailTemplateName = keyof typeof templates;

export function renderTemplate(
  name: EmailTemplateName,
  vars: Record<string, string>
): string {
  let html = templates[name];
  for (const [key, value] of Object.entries(vars)) {
    html = html.replaceAll(`{{${key}}}`, value);
  }
  return html;
}
