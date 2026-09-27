"use client";

import { useApp } from "../app-provider";
import { CardIcon } from "../icons";

/** Link to the payment receipt (PDF) of an order paid through the checkout. */
export function ReceiptLink({ transactionId, className }: { transactionId: string | null | undefined; className?: string }) {
  const { t } = useApp();
  if (!transactionId?.startsWith("pi_")) return null;
  return (
    <a href={`/api/payments/intents/${transactionId.slice(3)}/receipt`} target="_blank" rel="noopener" className={`inline-flex items-center gap-1 text-sm font-semibold text-brand-700 hover:underline ${className ?? ""}`} data-testid="receipt-link">
      <CardIcon className="size-4" />{t.pay.receipt}
    </a>
  );
}
