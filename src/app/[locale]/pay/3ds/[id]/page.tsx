import { notFound } from "next/navigation";
import { Bank3ds } from "@/components/payments/bank-3ds";
import { currentUser } from "@/lib/auth/session";
import { gatewayConfig } from "@/lib/payments/gateway";
import { getIntent } from "@/lib/payments/intents";

/** Sandbox only: the simulated bank's 3-D Secure page. */
export default async function Bank3dsPage({ params }: { params: Promise<{ id: string }> }) {
  if (gatewayConfig()) notFound();
  const { id } = await params;
  const user = await currentUser();
  const intent = user ? await getIntent(user.id, id).catch(() => null) : null;
  if (!intent) notFound();
  return <Bank3ds id={id} amountSAR={intent.amountSAR} />;
}
