"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { fmt } from "@/i18n";
import { cityName } from "@/lib/data/cities";
import type { PrivacyPolicyResponse } from "@/lib/mt-evisa/types";
import { useApp } from "../app-provider";
import { AuthForm } from "../auth-form";
import { CardIcon, HotelIcon, LockIcon, PlaneIcon, ShieldIcon, TicketIcon } from "../icons";
import { Alert, Badge, Button, Card, Field, Input, SectionTitle, Stars } from "../ui";
import { useBooking } from "./booking-context";
import { useTravellerValidation } from "./travellers-step";
import { WizardShell } from "./wizard-shell";

function PrivacyPolicy() {
  const { t, locale } = useApp();
  const { disclaimerAccepted, setDisclaimer } = useBooking();
  const [policy, setPolicy] = useState<PrivacyPolicyResponse | null>(null);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    fetch("/api/privacy-policy").then((r) => (r.ok ? r.json() : null)).then(setPolicy).catch(() => setPolicy(null));
  }, []);

  const items = policy ? (locale === "ar" ? policy.privacyPolicyAr : policy.privacyPolicyEn) : [];
  const acks = policy ? (locale === "ar" ? policy.acknowledgementAr : policy.acknowledgementEn) : [];
  const disclaimer = policy ? (locale === "ar" ? policy.disclaimerAr : policy.disclaimerEn) : t.review.privacyAccept;

  return (
    <Card className="p-5 sm:p-6">
      <SectionTitle title={t.review.privacy} icon={<ShieldIcon className="size-5" />} />
      <button type="button" className="mt-3 text-sm font-semibold text-brand-700 hover:underline" onClick={() => setOpen((o) => !o)} aria-expanded={open}>
        {t.review.readPolicy}
      </button>
      {open && policy && (
        <div className="mt-3 max-h-72 space-y-3 overflow-y-auto rounded-lg bg-slate-50 p-4 text-sm leading-relaxed text-slate-700">
          {items.map((p) => <p key={p.policyId} className="whitespace-pre-line">{p.policyDetails}</p>)}
        </div>
      )}
      <ul className="mt-4 space-y-2 text-sm leading-relaxed text-slate-700">
        {acks.map((a) => <li key={a.acknowledgmentId} className="rounded-lg border border-slate-200 p-3">{a.acknowledgmentDetails}</li>)}
      </ul>
      <label className="mt-4 flex cursor-pointer items-start gap-3 rounded-lg bg-gold-50 p-3 text-sm font-medium text-ink ring-1 ring-gold-500/30">
        <input type="checkbox" className="mt-0.5 size-5 accent-brand-700" checked={disclaimerAccepted} onChange={(e) => setDisclaimer(e.target.checked)} />
        <span>{disclaimer}</span>
      </label>
    </Card>
  );
}

export function ReviewStep() {
  const { t, locale, money, user, currency } = useApp();
  const booking = useBooking();
  const router = useRouter();
  const { valid } = useTravellerValidation();
  const [card, setCard] = useState({ holder: "", number: "", exp: "", cvc: "" });
  const [clientReference, setClientReference] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const price = booking.price;

  async function pay(e: React.FormEvent) {
    e.preventDefault();
    if (!price || !booking.criteria) return;
    if (!booking.disclaimerAccepted) {
      setError("disclaimerRequired");
      return;
    }
    setSubmitting(true);
    setError(null);
    const [expMonth = "", expYear = ""] = card.exp.split("/").map((s) => s.trim());
    try {
      const res = await fetch("/api/bookings", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          selection: { criteria: booking.criteria, flights: booking.flights, hotels: booking.hotels, activities: booking.activities },
          travellers: booking.travellers,
          disclaimerAccepted: booking.disclaimerAccepted,
          expectedTotalSAR: price.totalSAR,
          displayCurrency: currency,
          clientReference: clientReference || undefined,
          card: { holder: card.holder, number: card.number, expMonth, expYear, cvc: card.cvc },
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "generic");
      // The confirmation page clears the wizard state (clearing it here would redirect to search).
      router.push(`/${locale}/package-visa/confirmation/${data.booking.id}`);
    } catch (err) {
      setError((err as Error).message);
      setSubmitting(false);
    }
  }

  const errorText = error ? (t.review.errors as Record<string, string>)[error] ?? t.review.errors.generic : null;

  return (
    <WizardShell step={5} title={t.review.title} subtitle={t.review.subtitle}>
      <div className="grid gap-4">
        {!valid && (
          <Alert tone="error">
            {t.travellers.fixErrors} — <Link className="font-semibold underline" href={`/${locale}/package-visa/travellers`}>{t.common.edit}</Link>
          </Alert>
        )}

        <Card className="p-5 sm:p-6">
          <SectionTitle title={t.review.flights} icon={<PlaneIcon className="size-5" />} />
          <ul className="mt-4 divide-y divide-slate-100">
            {booking.selectedFlights.map((f) => (
              <li key={f.id} className="flex flex-wrap items-center justify-between gap-2 py-3 text-sm">
                <div>
                  <p className="font-semibold">{cityName(f.from, locale)} {locale === "ar" ? "←" : "→"} {cityName(f.to, locale)}</p>
                  <p className="ltr-nums text-xs text-slate-500">{f.flightNo} · {f.departAt.replace("T", " ")} → {f.arriveAt.slice(11)}</p>
                </div>
                <div className="flex items-center gap-3">
                  <Badge tone="gold">{locale === "ar" ? f.agentNameAr : f.agentNameEn}</Badge>
                  <span className="ltr-nums font-semibold">{money(f.totalSAR)}</span>
                </div>
              </li>
            ))}
          </ul>
        </Card>

        <Card className="p-5 sm:p-6">
          <SectionTitle title={t.review.hotels} icon={<HotelIcon className="size-5" />} />
          <ul className="mt-4 divide-y divide-slate-100">
            {booking.selectedHotels.map((h) => (
              <li key={h.id} className="flex flex-wrap items-center justify-between gap-2 py-3 text-sm">
                <div>
                  <p className="flex items-center gap-2 font-semibold">{locale === "ar" ? h.nameAr : h.nameEn} <Stars n={h.stars} /></p>
                  <p className="ltr-nums text-xs text-slate-500">{cityName(h.city, locale)} · {h.checkIn} → {h.checkOut}</p>
                </div>
                <div className="flex items-center gap-3">
                  <Badge tone="gold">{locale === "ar" ? h.agentNameAr : h.agentNameEn}</Badge>
                  <span className="ltr-nums font-semibold">{money(h.totalSAR)}</span>
                </div>
              </li>
            ))}
          </ul>
        </Card>

        {booking.selectedActivities.length > 0 && (
          <Card className="p-5 sm:p-6">
            <SectionTitle title={t.review.activities} icon={<TicketIcon className="size-5" />} />
            <ul className="mt-4 divide-y divide-slate-100">
              {booking.selectedActivities.map((a) => (
                <li key={a.id} className="flex flex-wrap items-center justify-between gap-2 py-3 text-sm">
                  <div>
                    <p className="font-semibold">{locale === "ar" ? a.titleAr : a.titleEn}</p>
                    <p className="ltr-nums text-xs text-slate-500">{cityName(a.city, locale)} · {a.date} {a.timeFrom}</p>
                  </div>
                  <span className="ltr-nums font-semibold">{money(a.totalSAR)}</span>
                </li>
              ))}
            </ul>
          </Card>
        )}

        <Card className="p-5 sm:p-6">
          <SectionTitle title={t.common.travellers} icon={<ShieldIcon className="size-5" />} />
          <ul className="mt-4 grid gap-2 sm:grid-cols-2">
            {booking.travellers.map((x, i) => (
              <li key={i} className="flex items-center gap-3 rounded-lg border border-slate-200 p-3 text-sm">
                {x.personPhoto ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={x.personPhoto} alt="" className="size-10 rounded-full object-cover" />
                ) : <span className="size-10 rounded-full bg-slate-200" />}
                <div>
                  <p className="font-semibold">{[x.firstNameEn, x.familyNameEn].join(" ")}</p>
                  <p className="ltr-nums text-xs text-slate-500">{x.passportNo} · {x.nationality}</p>
                </div>
              </li>
            ))}
          </ul>
        </Card>

        <PrivacyPolicy />

        {!user ? (
          <Card className="p-5 sm:p-6">
            <SectionTitle title={t.review.loginRequired} icon={<LockIcon className="size-5" />} />
            <div className="mt-5 max-w-2xl">
              <AuthForm compact onSuccess={() => undefined} />
            </div>
          </Card>
        ) : (
          <form onSubmit={pay}>
            <Card className="p-5 sm:p-6">
              <SectionTitle title={t.review.payment} icon={<CardIcon className="size-5" />} subtitle={t.review.secure} />
              {user.accountType === "company" && (
                <div className="mt-5 grid gap-4 rounded-lg bg-brand-50 p-4 sm:grid-cols-2">
                  <div className="text-sm">
                    <p className="text-slate-500">{t.review.invoiceTo}</p>
                    <p className="font-semibold">{user.company?.companyName}</p>
                    <p className="ltr-nums text-xs text-slate-500">VAT {user.company?.vatNo || "—"} · CR {user.company?.commercialRegNo}</p>
                  </div>
                  <Field label={t.review.clientReference}>
                    <Input value={clientReference} maxLength={40} onChange={(e) => setClientReference(e.target.value)} />
                  </Field>
                </div>
              )}
              <div className="mt-5 grid gap-4 sm:grid-cols-2">
                <Field label={t.review.cardHolder} required className="sm:col-span-2">
                  <Input dir="ltr" autoComplete="cc-name" value={card.holder} onChange={(e) => setCard({ ...card, holder: e.target.value })} required />
                </Field>
                <Field label={t.review.cardNumber} required className="sm:col-span-2">
                  <Input dir="ltr" inputMode="numeric" autoComplete="cc-number" placeholder="0000 0000 0000 0000" value={card.number}
                    onChange={(e) => setCard({ ...card, number: e.target.value.replace(/[^\d ]/g, "").slice(0, 23) })} required />
                </Field>
                <Field label={t.review.expiry} required>
                  <Input dir="ltr" inputMode="numeric" autoComplete="cc-exp" placeholder="MM/YY" value={card.exp}
                    onChange={(e) => setCard({ ...card, exp: e.target.value.replace(/[^\d/]/g, "").slice(0, 5) })} required />
                </Field>
                <Field label={t.review.cvc} required>
                  <Input dir="ltr" inputMode="numeric" autoComplete="cc-csc" type="password" value={card.cvc}
                    onChange={(e) => setCard({ ...card, cvc: e.target.value.replace(/\D/g, "").slice(0, 4) })} required />
                </Field>
              </div>
              <Alert tone="info" className="mt-4"><Badge tone="gold" className="me-2">{t.common.sandbox}</Badge>{t.review.testCards}</Alert>
              {errorText && <Alert tone="error" className="mt-4">{errorText}</Alert>}
              <Button type="submit" size="lg" variant="gold" className="mt-5 w-full" loading={submitting} disabled={!valid || !price}>
                <LockIcon className="size-5" />
                {submitting ? t.review.paying : fmt(t.review.pay, { amount: price ? money(price.totalSAR) : "" })}
              </Button>
            </Card>
          </form>
        )}
      </div>
    </WizardShell>
  );
}
