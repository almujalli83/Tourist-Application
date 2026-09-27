/** Apple Pay domain verification file (provided by the gateway / Apple, set in APPLE_PAY_DOMAIN_ASSOCIATION). */
export async function GET() {
  const v = process.env.APPLE_PAY_DOMAIN_ASSOCIATION?.trim();
  return v ? new Response(v, { headers: { "content-type": "text/plain" } }) : new Response("Not found", { status: 404 });
}
