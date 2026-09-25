"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { fmt } from "@/i18n";
import { formatExpiryInput, parseExpiry } from "@/lib/card-expiry";
import type { EsimKind, EsimPlan } from "@/lib/esim/tygo";
import { useApp } from "../app-provider";
import { LockIcon } from "../icons";
import { Alert, Button, Card, cx, Field, Input, Spinner } from "../ui";
import { EsimPlanPicker } from "./plan-picker";

interface Recipient { ref: string; name: string; emailMasked: string }
const newKey = () => (typeof crypto !== "undefined" && "randomUUID" in crypto ? crypto.randomUUID() : `${Date.now()}-${Math.random()}`);

/** Standalone eSIM purchase (for travellers who decide after booking, or without a package). */
export function EsimView() {
  const { t, locale, money, user, currency } = useApp();
  const e = t.esim;
  const router = useRouter();
  const [plans, setPlans] = useState<EsimPlan[] | null>(null);
  const [tripDays, setTripDays] = useState<number | null>(null);
  const [kind, setKind] = useState<EsimKind>("data");
  const [plan, setPlan] = useState<EsimPlan | null>(null);
  const [recipients, setRecipients] = useState<Recipient[] | null>(null);
  const [chosen, setChosen] = useState<string[]>(["me"]);
  const [card, setCard] = useState({ holder: "", number: "", exp: "", cvc: "" });
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const key = useRef(newKey());

  useEffect(() => {
    fetch("/api/esim/plans").then((r) => r.json()).then((d) => { setPlans(d.plans); setTripDays(d.tripDays); }).catch(() => setPlans([]));
  }, []);
  useEffect(() => {
    if (!user) return;
    fetch("/api/esim/recipients", { cache: "no-store" }).then((r) => (r.ok ? r.json() : { recipients: [] })).then((d) => setRecipients(d.recipients));
  }, [user]);
  useEffect(() => {
    key.current = newKey();
    setErr(null);
  }, [plan, chosen]);

  const total = plan ? Math.round(plan.priceSAR * chosen.length * 100) / 100 : 0;

  async function pay(ev: React.FormEvent) {
    ev.preventDefault();
    if (!plan) return;
    if (!chosen.length) {
      setErr(e.chooseRecipients);
      return;
    }
    setBusy(true);
    setErr(null);
    try {
      const { expMonth, expYear } = parseExpiry(card.exp);
      const res = await fetch("/api/esim/orders", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ planId: plan.id, recipients: chosen, expectedTotalSAR: total, idempotencyKey: key.current, displayCurrency: currency, card: { holder: card.holder, number: card.number.replace(/\s/g, ""), expMonth, expYear, cvc: card.cvc } }),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) {
        setErr((e.errors as Record<string, string>)[body.error] ?? e.errors.generic);
        key.current = newKey();
        return;
      }
      router.push(`/${locale}/account/esim/${body.order.id}?new=1`);
    } finally {
      setBusy(false);
    }
  }

  if (!plans) return <div className="grid min-h-[40vh] place-items-center text-brand-700"><Spinner className="size-8" /></div>;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold sm:text-3xl">{e.title}</h1>
        <p className="mt-1 max-w-3xl text-sm text-slate-600">{e.subtitle}</p>
      </div>
      <div className="grid gap-6 lg:grid-cols-[1fr_360px]">
        <div className="min-w-0 space-y-6">
          <Card className="p-5">
            <EsimPlanPicker plans={plans} kind={kind} onKind={setKind} selectedId={plan?.id ?? null} onSelect={setPlan} tripDays={tripDays} />
          </Card>
          {plan && user && (
            <Card className="p-5">
              <h2 className="font-bold">{e.whoTitle}</h2>
              <p className="mt-1 text-xs text-slate-500">{e.emailNote}</p>
              {recipients === null ? <Spinner className="mt-4 size-5 text-brand-600" /> : (
                <div className="mt-4 grid gap-2 sm:grid-cols-2" data-testid="esim-recipients">
                  {recipients.map((r) => {
                    const on = chosen.includes(r.ref);
                    return (
                      <label key={r.ref} className={cx("flex cursor-pointer items-center gap-3 rounded-xl border p-3", on ? "border-brand-600 bg-brand-50" : "border-slate-200")}>
                        <input type="checkbox" checked={on} onChange={() => setChosen(on ? chosen.filter((x) => x !== r.ref) : [...chosen, r.ref])} className="size-4 accent-brand-700" />
                        <span className="min-w-0">
                          <span className="block truncate text-sm font-semibold" dir="ltr">{r.name}{r.ref === "me" && <span className="font-normal text-slate-500"> ({e.me})</span>}</span>
                          <span className="block text-xs text-slate-500" dir="ltr">{r.emailMasked}</span>
                        </span>
                      </label>
                    );
                  })}
                </div>
              )}
              <Link href={`/${locale}/account/travellers`} className="mt-3 inline-block text-xs font-semibold text-brand-700 hover:underline">{e.addTravellers}</Link>
            </Card>
          )}
        </div>
        <div className="lg:sticky lg:top-24 lg:self-start">
          <Card className="p-5">
            <h2 className="font-bold">{t.review.priceSummary}</h2>
            <dl className="mt-3 space-y-1.5 text-sm">
              <div className="flex justify-between gap-3"><dt className="text-slate-500">{e.plan}</dt><dd className="text-end font-semibold">{plan ? `${plan.dataGB === null ? e.unlimited : fmt(e.dataGB, { n: plan.dataGB })} · ${fmt(e.days, { n: plan.days })}` : "—"}</dd></div>
              <div className="flex justify-between"><dt className="text-slate-500">{e.recipients}</dt><dd className="font-semibold">{chosen.length}</dd></div>
              <div className="flex justify-between border-t border-slate-100 pt-2 font-bold"><dt>{t.common.total}</dt><dd className="text-brand-800" data-testid="esim-total">{money(total)}</dd></div>
            </dl>
            {err && <Alert tone="error" className="mt-3">{err}</Alert>}
            {!user ? (
              <div className="mt-4 space-y-3">
                <p className="text-sm text-slate-600">{e.loginToBuy}</p>
                <Link href={`/${locale}/login?next=${encodeURIComponent(`/${locale}/esim`)}`} className="inline-flex h-11 w-full items-center justify-center rounded-lg bg-brand-700 text-sm font-semibold text-white hover:bg-brand-800">{e.login}</Link>
              </div>
            ) : (
              <form onSubmit={pay} className="mt-4 space-y-3">
                <Field label={t.review.cardHolder} required><Input dir="ltr" autoComplete="cc-name" value={card.holder} onChange={(x) => setCard({ ...card, holder: x.target.value })} required /></Field>
                <Field label={t.review.cardNumber} required><Input dir="ltr" inputMode="numeric" autoComplete="cc-number" placeholder="0000 0000 0000 0000" value={card.number} onChange={(x) => setCard({ ...card, number: x.target.value.replace(/[^\d ]/g, "").slice(0, 23) })} required /></Field>
                <div className="grid grid-cols-2 gap-3">
                  <Field label={t.review.expiry} required><Input dir="ltr" inputMode="numeric" autoComplete="cc-exp" placeholder="MM/YY" value={card.exp} onChange={(x) => setCard({ ...card, exp: formatExpiryInput(x.target.value).slice(0, 7) })} required /></Field>
                  <Field label={t.review.cvc} required><Input dir="ltr" inputMode="numeric" autoComplete="cc-csc" type="password" value={card.cvc} onChange={(x) => setCard({ ...card, cvc: x.target.value.replace(/\D/g, "").slice(0, 4) })} required /></Field>
                </div>
                <p className="text-xs text-slate-500">{t.review.testCards}</p>
                <Button type="submit" variant="gold" size="lg" className="w-full" loading={busy} disabled={!plan}>
                  <LockIcon className="size-5" />{busy ? e.paying : fmt(e.pay, { amount: money(total) })}
                </Button>
              </form>
            )}
          </Card>
        </div>
      </div>
    </div>
  );
}
