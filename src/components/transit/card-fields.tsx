"use client";

import { formatExpiryInput, parseExpiry } from "@/lib/card-expiry";
import type { CardInput } from "@/lib/payment";
import { useApp } from "../app-provider";
import { Field, Input } from "../ui";

export type CardDraft = { holder: string; number: string; exp: string; cvc: string };
export const EMPTY_CARD: CardDraft = { holder: "", number: "", exp: "", cvc: "" };
export function toCardInput(c: CardDraft): CardInput {
  const { expMonth, expYear } = parseExpiry(c.exp);
  return { holder: c.holder, number: c.number.replace(/\s/g, ""), expMonth, expYear, cvc: c.cvc };
}

/** Card holder, number, expiry and CVC (the card is charged by the payment gateway, never stored). */
export function CardFields({ card, onChange }: { card: CardDraft; onChange: (c: CardDraft) => void }) {
  const { t } = useApp();
  return (
    <div className="grid gap-3 sm:grid-cols-2">
      <Field label={t.review.cardHolder} required><Input dir="ltr" autoComplete="cc-name" value={card.holder} onChange={(x) => onChange({ ...card, holder: x.target.value })} data-testid="card-holder" /></Field>
      <Field label={t.review.cardNumber} required><Input dir="ltr" inputMode="numeric" autoComplete="cc-number" placeholder="0000 0000 0000 0000" value={card.number} onChange={(x) => onChange({ ...card, number: x.target.value.replace(/[^\d ]/g, "").slice(0, 23) })} data-testid="card-number" /></Field>
      <Field label={t.review.expiry} required><Input dir="ltr" inputMode="numeric" autoComplete="cc-exp" placeholder="MM/YY" value={card.exp} onChange={(x) => onChange({ ...card, exp: formatExpiryInput(x.target.value).slice(0, 7) })} data-testid="card-exp" /></Field>
      <Field label={t.review.cvc} required><Input dir="ltr" inputMode="numeric" autoComplete="cc-csc" type="password" value={card.cvc} onChange={(x) => onChange({ ...card, cvc: x.target.value.replace(/\D/g, "").slice(0, 4) })} data-testid="card-cvc" /></Field>
    </div>
  );
}
