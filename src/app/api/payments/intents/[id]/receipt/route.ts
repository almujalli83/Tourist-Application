import { currentUser } from "@/lib/auth/session";
import { error, handle } from "@/lib/http";
import { intentForReceipt, PayError } from "@/lib/payments/intents";
import { simplePdf } from "@/lib/simple-pdf";

/** Payment receipt (PDF). */
export const GET = handle(async (_req: Request, { params }: { params: Promise<{ id: string }> }) => {
  const user = await currentUser();
  if (!user) return error("unauthorized", 401);
  let r;
  try {
    r = await intentForReceipt(user.id, (await params).id);
  } catch (e) {
    if (e instanceof PayError) return error(e.code, e.status);
    throw e;
  }
  const method = r.method === "card" ? `${r.brand.toUpperCase()} •••• ${r.last4}` : r.method === "applepay" ? "Apple Pay" : r.method === "googlepay" ? "Google Pay" : "STC Pay";
  const pdf = simplePdf([
    { text: "Saudi Trip — Payment receipt", size: 18, bold: true },
    { text: "" },
    { text: `Receipt: ${r.id}` },
    { text: `Date: ${r.createdAt.slice(0, 16).replace("T", " ")} UTC` },
    { text: `For: ${r.description || "-"}` },
    { text: `Amount: SAR ${r.amountSAR.toFixed(2)}`, bold: true },
    { text: `Paid with: ${method}` },
    { text: `Status: ${r.status}${r.refundedSAR ? ` (refunded SAR ${r.refundedSAR.toFixed(2)})` : ""}` },
    { text: "" },
    { text: "Amounts are in Saudi riyals. This receipt is not a tax invoice.", size: 9 },
  ]);
  return new Response(new Uint8Array(pdf), { headers: { "content-type": "application/pdf", "content-disposition": `inline; filename="receipt-${r.id.slice(0, 8)}.pdf"` } });
});
