/** Card expiry input helpers (client-safe): accepts "MM/YY", "MMYY", "M/YY" or "MM/YYYY". */

/** Formats what the user types as "MM/YY", inserting the slash automatically. */
export function formatExpiryInput(raw: string): string {
  const slash = raw.indexOf("/");
  let month = (slash >= 0 ? raw.slice(0, slash) : raw).replace(/\D/g, "");
  let rest = slash >= 0 ? raw.slice(slash + 1).replace(/\D/g, "") : "";
  if (slash < 0 && month.length > 2) {
    rest = month.slice(2);
    month = month.slice(0, 2);
  }
  // "1/29" → "01/29"; a first digit above 1 can only be a one-digit month.
  if (month.length === 1 && (slash >= 0 || Number(month) > 1)) month = `0${month}`;
  if (month.length === 2 && (rest.length || slash >= 0 || raw.length > 2)) return `${month}/${rest.slice(0, 4)}`;
  return month;
}

/** Splits an expiry into month and two-digit year. */
export function parseExpiry(value: string): { expMonth: string; expYear: string } {
  const [m = "", y = ""] = formatExpiryInput(value).split("/");
  return { expMonth: m, expYear: y.length === 4 ? y.slice(2) : y };
}
