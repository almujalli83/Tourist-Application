"use client";

import { useState } from "react";
import { fmt } from "@/i18n";
import { useApp } from "../app-provider";
import { Button, Card } from "../ui";

/** The sandbox bank's 3-D Secure page (inside the checkout's frame). */
export function Bank3ds({ id, amountSAR }: { id: string; amountSAR: number | null }) {
  const { t, money } = useApp();
  const b = t.pay.bank;
  const [done, setDone] = useState<boolean | null>(null);
  async function answer(approve: boolean) {
    await fetch(`/api/payments/intents/${id}/3ds`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ approve }) }).catch(() => undefined);
    setDone(approve);
  }
  return (
    <Card className="mx-auto mt-6 max-w-sm space-y-4 p-6 text-center" data-testid="bank-3ds">
      <p className="text-lg font-bold">🏦 {b.title}</p>
      {done === null ? (
        <>
          <p className="text-sm">{fmt(b.body, { amount: amountSAR != null ? money(amountSAR) : "—" })}</p>
          <div className="flex justify-center gap-2">
            <Button onClick={() => void answer(true)} data-testid="bank-approve">{b.approve}</Button>
            <Button variant="ghost" onClick={() => void answer(false)} data-testid="bank-decline">{b.decline}</Button>
          </div>
        </>
      ) : (
        <p className="text-sm font-semibold">{done ? "✓" : "✗"}</p>
      )}
    </Card>
  );
}
