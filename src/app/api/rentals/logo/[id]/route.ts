import { getCompany } from "@/lib/rentals/companies";

/** A rental company's logo (public, cached; the URL changes with each upload). */
export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const c = await getCompany((await params).id);
  const m = c?.logo?.match(/^data:(image\/[\w+.-]+);base64,(.+)$/);
  if (!m) return new Response("Not found", { status: 404 });
  return new Response(Buffer.from(m[2], "base64"), {
    headers: {
      "content-type": m[1],
      "cache-control": "public, max-age=31536000, immutable",
      // SVG logos are shown as images only; never as documents that could run scripts.
      "content-security-policy": "default-src 'none'; style-src 'unsafe-inline'; sandbox",
      "x-content-type-options": "nosniff",
    },
  });
}
