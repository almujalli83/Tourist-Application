/**
 * Catches likely typos in an email address's domain ("gmial.com", "hotmail.con") so the eVisa and
 * insurance policy are not sent to an address that doesn't exist. Suggests; never changes by itself.
 */
const DOMAINS = [
  "gmail.com", "googlemail.com", "hotmail.com", "outlook.com", "live.com", "msn.com", "yahoo.com", "ymail.com",
  "icloud.com", "me.com", "aol.com", "proton.me", "protonmail.com", "yandex.com", "mail.ru", "qq.com", "163.com",
  "gmx.com", "gmx.de", "web.de", "orange.fr", "hotmail.fr", "yahoo.fr", "hotmail.co.uk", "yahoo.co.uk",
];
const TLD_TYPOS: Record<string, string> = { con: "com", cmo: "com", comm: "com", ocm: "com", vom: "com", xom: "com", cim: "com", nte: "net", ent: "net", ogr: "org" };

/** Edit distance with swapped neighbours counted as one edit (Damerau–Levenshtein, optimal string alignment). */
function distance(a: string, b: string): number {
  const d = Array.from({ length: a.length + 1 }, (_, i) => [i, ...Array<number>(b.length).fill(0)]);
  for (let j = 1; j <= b.length; j++) d[0][j] = j;
  for (let i = 1; i <= a.length; i++) {
    for (let j = 1; j <= b.length; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      d[i][j] = Math.min(d[i - 1][j] + 1, d[i][j - 1] + 1, d[i - 1][j - 1] + cost);
      if (i > 1 && j > 1 && a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1]) d[i][j] = Math.min(d[i][j], d[i - 2][j - 2] + 1);
    }
  }
  return d[a.length][b.length];
}

/** The corrected address when the domain looks mistyped, otherwise null. */
export function suggestEmail(value: string): string | null {
  const v = value.trim();
  const at = v.lastIndexOf("@");
  if (at < 1 || at === v.length - 1) return null;
  const local = v.slice(0, at);
  const domain = v.slice(at + 1).toLowerCase();
  if (DOMAINS.includes(domain)) return null;
  let best: string | null = null;
  let bestD = Infinity;
  for (const known of DOMAINS) {
    const dd = distance(domain, known);
    if (dd < bestD) [best, bestD] = [known, dd];
  }
  if (best && bestD <= (domain.length > 6 ? 2 : 1)) return `${local}@${best}`;
  const dot = domain.lastIndexOf(".");
  const fixed = dot > 0 ? TLD_TYPOS[domain.slice(dot + 1)] : undefined;
  return fixed ? `${local}@${domain.slice(0, dot + 1)}${fixed}` : null;
}
