/**
 * Data residency. With DATA_RESIDENCY=ksa the platform keeps personal data in the Kingdom: services
 * that would send it abroad are switched off (AI features fall back to their built-in rules, support
 * messages are not machine-translated, files are stored in the database). CROSS_BORDER_ALLOW
 * (comma-separated keys) re-enables a service once a lawful transfer basis exists (PDPL art. 29).
 */
export const CROSS_BORDER = ["ai", "translate", "blob"] as const;
export type CrossBorder = (typeof CROSS_BORDER)[number];

export const residencyMode = (): "ksa" | "open" => (process.env.DATA_RESIDENCY?.trim().toLowerCase() === "ksa" ? "ksa" : "open");

export function crossBorderAllowed(kind: CrossBorder): boolean {
  if (residencyMode() !== "ksa") return true;
  return (process.env.CROSS_BORDER_ALLOW ?? "").split(",").map((s) => s.trim().toLowerCase()).includes(kind);
}

/** Where data goes (for the back office and the deployment checklist). Booleans and hosts only. */
export function dataFlows() {
  const dbUrl = process.env.DATABASE_URL || process.env.POSTGRES_URL || "";
  let dbHost: string | null = null;
  try {
    dbHost = dbUrl ? new URL(dbUrl).hostname : null;
  } catch {
    dbHost = "invalid";
  }
  const aiKey = !!(process.env.ANTHROPIC_API_KEY?.trim() || process.env.ANTHROPIC_AUTH_TOKEN?.trim());
  return {
    mode: residencyMode(),
    region: process.env.DATA_REGION?.trim() || null,
    hosting: process.env.HOSTING_PROVIDER?.trim() || (process.env.VERCEL ? "vercel" : null),
    database: dbUrl ? { host: dbHost } : { host: null, file: true },
    encryptionKey: !!process.env.DATA_ENCRYPTION_KEY?.trim(),
    services: [
      { key: "ai", configured: aiKey, active: aiKey && crossBorderAllowed("ai"), abroad: true },
      { key: "translate", configured: process.env.SUPPORT_TRANSLATE !== "off", active: process.env.SUPPORT_TRANSLATE !== "off" && crossBorderAllowed("translate"), abroad: true },
      { key: "blob", configured: !!process.env.BLOB_READ_WRITE_TOKEN?.trim(), active: !!process.env.BLOB_READ_WRITE_TOKEN?.trim() && crossBorderAllowed("blob"), abroad: true },
      { key: "email", configured: !!process.env.RESEND_API_KEY?.trim(), active: !!process.env.RESEND_API_KEY?.trim(), abroad: !process.env.RESEND_API_URL?.trim(), host: hostOf(process.env.RESEND_API_URL) ?? "api.resend.com" },
    ],
  };
}

function hostOf(url: string | undefined): string | null {
  try {
    return url ? new URL(url).hostname : null;
  } catch {
    return null;
  }
}
