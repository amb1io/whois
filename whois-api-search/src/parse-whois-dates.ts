export interface DomainEventDates {
  expiringDate: string | null;
  lastChanged: string | null;
}

const UPDATED_LABEL =
  /^(?:updated(?:\s+date)?|last(?:\s+|-)?updated|last(?:\s+|-)?modified|modified|changed|change(?:\s+|-)?date)$/i;

const EXPIRY_LABEL =
  /^(?:expiry(?:\s+|-)?date|expiration(?:\s+|-)?date|registry(?:\s+|-)?expiry(?:\s+|-)?date|registrar(?:\s+|-)?registration(?:\s+|-)?expiration(?:\s+|-)?date|expires?|expire(?:\s+|-)?date|paid-till|renewal(?:\s+|-)?date)$/i;

function normalizeLabel(label: string): string {
  return label.trim().replace(/\s+/g, " ");
}

export function normalizeWhoisDate(value: string): string | null {
  const trimmed = value.trim();
  if (!trimmed || /^n\/a$/i.test(trimmed) || trimmed === "-") {
    return null;
  }

  if (/^\d{8}$/.test(trimmed)) {
    const year = trimmed.slice(0, 4);
    const month = trimmed.slice(4, 6);
    const day = trimmed.slice(6, 8);
    const date = new Date(`${year}-${month}-${day}T00:00:00.000Z`);
    return Number.isNaN(date.getTime()) ? null : date.toISOString();
  }

  const normalized = trimmed.replace(/^(\d{2})\.(\d{2})\.(\d{4})$/, "$3-$2-$1");
  const parsed = Date.parse(normalized);
  if (Number.isNaN(parsed)) {
    return null;
  }

  return new Date(parsed).toISOString();
}

export function extractWhoisEventDates(whoisText: string): DomainEventDates {
  let lastChanged: string | null = null;
  let expiringDate: string | null = null;

  for (const line of whoisText.split(/\r?\n/)) {
    const separator = line.indexOf(":");
    if (separator <= 0) {
      continue;
    }

    const label = normalizeLabel(line.slice(0, separator));
    const value = line.slice(separator + 1).trim();
    if (!value) {
      continue;
    }

    if (!lastChanged && UPDATED_LABEL.test(label)) {
      lastChanged = normalizeWhoisDate(value);
      continue;
    }

    if (!expiringDate && EXPIRY_LABEL.test(label)) {
      expiringDate = normalizeWhoisDate(value);
    }
  }

  return { expiringDate, lastChanged };
}
