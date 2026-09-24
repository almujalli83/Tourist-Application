/**
 * Payment gateway adapter. The sandbox gateway validates card data and approves
 * test cards; a live PSP (e.g. mada / Visa / Mastercard / Apple Pay acquirer) plugs in here.
 * Card data is never stored — only the last 4 digits and the transaction id.
 */
import { randomUUID } from "node:crypto";

export interface CardInput {
  holder: string;
  number: string;
  expMonth: string;
  expYear: string;
  cvc: string;
}

export type PaymentResult =
  | { ok: true; transactionId: string; method: string; last4: string }
  | { ok: false; code: "invalid_card" | "expired" | "declined" };

export function luhn(num: string): boolean {
  let sum = 0;
  let dbl = false;
  for (let i = num.length - 1; i >= 0; i--) {
    let d = num.charCodeAt(i) - 48;
    if (dbl) {
      d *= 2;
      if (d > 9) d -= 9;
    }
    sum += d;
    dbl = !dbl;
  }
  return num.length >= 12 && sum % 10 === 0;
}

export function cardBrand(num: string): string {
  if (/^(4464|4847|5297|5890|6346|5043|4406|5895)/.test(num)) return "mada";
  if (/^4/.test(num)) return "visa";
  if (/^(5[1-5]|2[2-7])/.test(num)) return "mastercard";
  return "card";
}

export async function chargeCard(card: CardInput, amountSAR: number, now = new Date()): Promise<PaymentResult> {
  const num = card.number.replace(/\D/g, "");
  if (!luhn(num) || !/^\d{3,4}$/.test(card.cvc) || !card.holder.trim() || !(amountSAR > 0))
    return { ok: false, code: "invalid_card" };
  const month = Number(card.expMonth);
  const year = 2000 + (Number(card.expYear) % 100);
  if (!(month >= 1 && month <= 12) || new Date(Date.UTC(year, month, 1)) <= now) return { ok: false, code: "expired" };
  // Sandbox: cards ending with 0002 are declined.
  if (num.endsWith("0002")) return { ok: false, code: "declined" };
  return { ok: true, transactionId: `TXN-${randomUUID()}`, method: cardBrand(num), last4: num.slice(-4) };
}
