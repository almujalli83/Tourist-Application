/** RFC 9116 vulnerability disclosure contact (NCA ECC: vulnerability management). */
export function GET(req: Request) {
  const origin = new URL(req.url).origin;
  const contact = process.env.SECURITY_CONTACT?.trim() || process.env.PRIVACY_CONTACT_EMAIL?.trim() || null;
  const expires = new Date(Date.now() + 180 * 86_400_000).toISOString();
  const lines = [
    contact ? `Contact: ${/^(mailto:|https?:)/.test(contact) ? contact : `mailto:${contact}`}` : `Contact: ${origin}/en/support`,
    `Expires: ${expires}`,
    "Preferred-Languages: ar, en",
    `Policy: ${origin}/en/privacy`,
    `Canonical: ${origin}/.well-known/security.txt`,
  ];
  return new Response(lines.join("\n") + "\n", { headers: { "content-type": "text/plain; charset=utf-8", "cache-control": "public, max-age=86400" } });
}
