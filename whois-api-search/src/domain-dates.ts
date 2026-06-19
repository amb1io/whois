import { extractRdapEventDates } from "./rdap";
import {
  extractWhoisEventDates,
  type DomainEventDates,
} from "./parse-whois-dates";

export type { DomainEventDates };

export function extractDomainEventDates(
  data: Record<string, unknown>
): DomainEventDates {
  if (data.source === "whois" && typeof data.whoisText === "string") {
    return extractWhoisEventDates(data.whoisText);
  }

  return extractRdapEventDates(data);
}
