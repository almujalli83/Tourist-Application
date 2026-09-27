/** Public address of the site for links in emails: PUBLIC_SITE_URL, the Vercel address, or the request's. */
export function siteUrl(req?: Request): string {
  const vercel = process.env.VERCEL_PROJECT_PRODUCTION_URL?.trim();
  const env = process.env.PUBLIC_SITE_URL?.trim() || (vercel ? `https://${vercel}` : "");
  if (env) return env.replace(/\/$/, "");
  return req ? new URL(req.url).origin : "";
}
