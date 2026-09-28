"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { fmt } from "@/i18n";
import { MAKKAH, SAUDI_CITIES, UMRAH_CITY } from "@/lib/data/cities";
import { fmtKsa } from "@/lib/events/format";
import { EMAIL_RE } from "@/lib/auth/validation";
import { earnPoints } from "@/lib/loyalty/rules";
import { validatePhone } from "@/lib/phone";
import type { HotelOffer, RoomOccupancy } from "@/lib/types";
import { useApp } from "../app-provider";
import { GuestsRoomsPicker } from "../booking/guests-rooms-picker";
import { HotelIcon, MapPinIcon } from "../icons";
import { Checkout, type PaymentRef } from "../payments/checkout";
import { PhoneInput } from "../phone-input";
import { Alert, Badge, Button, Card, cx, Field, Input, Select, Spinner, Stars, Textarea } from "../ui";
import { errText, StandaloneShell, useEntry } from "./shell";

const pad = (n: number) => String(n).padStart(2, "0");
const ksaDay = (plus: number) => {
  const d = new Date(Date.now() + 3 * 3_600_000 + plus * 86_400_000);
  return `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}`;
};
const nextDay = (day: string, n = 1) => new Date(Date.parse(`${day}T00:00:00Z`) + n * 86_400_000).toISOString().slice(0, 10);

/** Hotels without a package: search every agent, choose a rate, pay now or at the hotel. */
export function HotelsView() {
  const { t, locale, money, user } = useApp();
  const s = t.standalone;
  const h = s.hotels;
  const ar = locale === "ar";
  const router = useRouter();
  const [entry, setEntry] = useEntry();
  const [q, setQ] = useState({ city: "RUH", checkIn: ksaDay(7), checkOut: ksaDay(10), umrah: false });
  const [rooms, setRooms] = useState<RoomOccupancy[]>([{ adults: 2, childAges: [] }]);
  const [offers, setOffers] = useState<HotelOffer[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [stars, setStars] = useState(0);
  const [payFilter, setPayFilter] = useState<"all" | "online" | "hotel">("all");
  const [chosen, setChosen] = useState<HotelOffer | null>(null);
  const [lead, setLead] = useState({ name: "", email: "", phone: "" });
  const [requests, setRequests] = useState("");
  const [busy, setBusy] = useState(false);

  // Links from other pages (a stopover, "complete your trip") prefill the search.
  useEffect(() => {
    const p = new URLSearchParams(location.search);
    const city = p.get("city");
    const ci = p.get("checkIn");
    const co = p.get("checkOut");
    if (city || ci || co) setQ((x) => ({ ...x, ...(city ? { city } : {}), ...(ci ? { checkIn: ci } : {}), ...(co ? { checkOut: co } : {}) }));
  }, []);
  useEffect(() => {
    if (user) setLead((l) => ({ name: l.name || user.individual?.fullName || user.company?.contactPerson || "", email: l.email || user.email, phone: l.phone || user.individual?.phone || user.company?.phone || "" }));
  }, [user]);

  async function search(e?: React.FormEvent) {
    e?.preventDefault();
    setErr(null);
    setChosen(null);
    if (q.city === UMRAH_CITY && !q.umrah) return setErr(s.errors.makkahMuslimsOnly);
    setLoading(true);
    const params = new URLSearchParams({ city: q.city, checkIn: q.checkIn, checkOut: q.checkOut, rooms: JSON.stringify(rooms), entry, ...(q.umrah ? { umrah: "1" } : {}) });
    const r = await fetch(`/api/stays/search?${params}`).catch(() => null);
    const d = await r?.json().catch(() => ({}));
    setLoading(false);
    if (!r?.ok) {
      setOffers(null);
      return setErr(errText(s.errors, d?.error));
    }
    setOffers(d.offers);
  }

  const shown = useMemo(() => (offers ?? []).filter((o) => (!stars || o.stars === stars) && (payFilter === "all" || o.rate?.pay === payFilter)), [offers, stars, payFilter]);
  const when = (iso: string) => fmtKsa(iso, locale, { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });

  async function book(payment: PaymentRef | undefined): Promise<boolean> {
    if (!chosen) return false;
    setErr(null);
    setBusy(true);
    const r = await fetch("/api/stays", {
      method: "POST", headers: { "content-type": "application/json" },
      body: JSON.stringify({ offer: chosen, city: q.city, checkIn: q.checkIn, checkOut: q.checkOut, rooms, entry, umrah: q.umrah, lead, requests, expectedTotalSAR: chosen.totalSAR, ...(payment ? { card: payment } : {}) }),
    }).catch(() => null);
    const d = await r?.json().catch(() => ({}));
    setBusy(false);
    if (!r?.ok) {
      setErr(errText(s.errors, d?.error));
      return false;
    }
    router.push(`/${locale}/account/stays/${d.stay.id}`);
    return true;
  }

  const cities = [...SAUDI_CITIES, MAKKAH];
  const points = chosen && chosen.rate?.pay === "online" && user?.accountType === "individual" ? earnPoints({ service: "stay", eligibleSAR: chosen.totalSAR }) : 0;
  // The same rules as the server, shown under each field so a disabled button is never a mystery.
  const leadErr = {
    name: lead.name.trim().replace(/\s+/g, " ").includes(" ") ? undefined : s.errors.leadName,
    email: EMAIL_RE.test(lead.email.trim()) ? undefined : s.errors.email,
    phone: validatePhone(lead.phone) ? s.errors.phone : undefined,
  };
  const leadOk = !leadErr.name && !leadErr.email && !leadErr.phone;
  const shownErr = (k: keyof typeof leadErr) => (lead[k].trim() ? leadErr[k] : undefined);

  return (
    <StandaloneShell tab="hotels" entry={entry} onEntry={setEntry}>
      <Card className="p-4 sm:p-5">
        <form onSubmit={search} className="grid gap-3 sm:grid-cols-2 lg:grid-cols-[1.2fr_1fr_1fr_1.4fr_auto] lg:items-end" noValidate>
          <Field label={h.city} htmlFor="st-city">
            <Select id="st-city" value={q.city} onChange={(e) => setQ({ ...q, city: e.target.value })} data-testid="st-city">
              {cities.map((c) => <option key={c.code} value={c.code}>{ar ? c.ar : c.en}</option>)}
            </Select>
          </Field>
          <Field label={h.checkIn} htmlFor="st-in">
            <Input id="st-in" type="date" dir="ltr" min={ksaDay(0)} value={q.checkIn} onChange={(e) => setQ({ ...q, checkIn: e.target.value, checkOut: e.target.value >= q.checkOut ? nextDay(e.target.value) : q.checkOut })} data-testid="st-in" />
          </Field>
          <Field label={h.checkOut} htmlFor="st-out">
            <Input id="st-out" type="date" dir="ltr" min={nextDay(q.checkIn)} value={q.checkOut} onChange={(e) => setQ({ ...q, checkOut: e.target.value })} data-testid="st-out" />
          </Field>
          <Field label={h.guests}>
            <GuestsRoomsPicker value={rooms} onChange={setRooms} />
          </Field>
          <Button type="submit" loading={loading} data-testid="st-search">{h.search}</Button>
          {q.city === UMRAH_CITY && (
            <label className="flex items-start gap-2 text-sm sm:col-span-2 lg:col-span-5">
              <input type="checkbox" checked={q.umrah} onChange={(e) => setQ({ ...q, umrah: e.target.checked })} className="mt-0.5 size-4 accent-brand-700" />{h.makkahConfirm}
            </label>
          )}
          {entry === "stopover" && <p className="text-xs text-slate-600 sm:col-span-2 lg:col-span-5">{h.stopoverMax}</p>}
        </form>
      </Card>

      {err && <Alert tone="error"><span data-testid="st-error">{err}</span></Alert>}
      {loading && <div className="grid place-items-center py-10 text-brand-700"><Spinner className="size-6" /></div>}

      {chosen ? (
        <div className="grid gap-5 lg:grid-cols-[1fr_380px]">
          <div className="space-y-4">
            <RateCard offer={chosen} selected when={when} />
            <Card className="space-y-3 p-5">
              <h2 className="font-bold">{h.payNoteTitle}</h2>
              <p className={cx("rounded-lg p-3 text-sm", chosen.rate?.pay === "online" ? "bg-brand-50 text-brand-900" : "bg-slate-50 text-slate-700")}>{h.payNoteOnline}</p>
              <p className={cx("rounded-lg p-3 text-sm", chosen.rate?.pay === "hotel" ? "bg-gold-50 text-ink" : "bg-slate-50 text-slate-700")}>{h.payNoteHotel}</p>
            </Card>
            <Button variant="ghost" onClick={() => setChosen(null)}>{h.back}</Button>
          </div>
          <Card className="h-fit space-y-4 p-5" data-testid="st-book">
            <h2 className="font-bold">{h.lead}</h2>
            <Field label={h.leadName} required error={shownErr("name")} htmlFor="st-lead-name"><Input id="st-lead-name" value={lead.name} onChange={(e) => setLead({ ...lead, name: e.target.value })} autoComplete="name" data-testid="st-lead-name" /></Field>
            <Field label={h.email} required error={shownErr("email")} htmlFor="st-lead-email"><Input id="st-lead-email" data-testid="st-lead-email" type="email" dir="ltr" value={lead.email} onChange={(e) => setLead({ ...lead, email: e.target.value })} autoComplete="email" /></Field>
            <Field label={h.phone} required error={shownErr("phone")} htmlFor="st-lead-phone"><PhoneInput id="st-lead-phone" value={lead.phone} onChange={(phone) => setLead({ ...lead, phone })} defaultCountry={user?.individual?.nationality || "SA"} invalid={!!shownErr("phone")} testId="st-lead-phone" /></Field>
            <Field label={h.requests} hint={h.requestsHint} htmlFor="st-req"><Textarea id="st-req" rows={2} value={requests} maxLength={500} onChange={(e) => setRequests(e.target.value)} /></Field>
            <div className="flex items-center justify-between border-t border-slate-100 pt-3">
              <span className="font-semibold">{h.total}</span>
              <span className="ltr-nums text-lg font-bold text-brand-800" data-testid="st-total">{money(chosen.totalSAR)}</span>
            </div>
            {points > 0 && <p className="text-sm font-medium text-gold-700">{fmt(h.earns, { n: points })}</p>}
            {user && !leadOk && <p className="text-sm text-amber-800" role="status" data-testid="st-incomplete">{s.completeForm}</p>}
            {!user ? (
              <Link href={`/${locale}/login?next=/${locale}/hotels`} className="inline-flex h-11 w-full items-center justify-center rounded-lg bg-brand-700 font-semibold text-white hover:bg-brand-800">{h.signIn}</Link>
            ) : chosen.rate?.pay === "online" ? (
              <Checkout amountSAR={chosen.totalSAR} description={`Hotel ${chosen.nameEn} ${q.checkIn}`} disabled={!leadOk} onPay={book} testId="st-pay" />
            ) : (
              <Button className="w-full" loading={busy} disabled={!leadOk} onClick={() => void book(undefined)} data-testid="st-confirm">{h.confirm}</Button>
            )}
          </Card>
        </div>
      ) : offers && !loading && (
        <div className="space-y-4">
          <div className="flex flex-wrap items-center gap-3">
            <p className="text-sm font-semibold" data-testid="st-count">{fmt(h.results, { n: shown.length })}</p>
            <div className="flex flex-wrap gap-1.5" role="group" aria-label={h.stars}>
              {[0, 3, 4, 5].map((n) => (
                <button key={n} type="button" aria-pressed={stars === n} onClick={() => setStars(n)} className={cx("h-8 rounded-full px-3 text-xs font-semibold ring-1 ring-inset", stars === n ? "bg-brand-700 text-white ring-brand-700" : "bg-white text-slate-700 ring-slate-200")}>
                  {n ? `${n}★` : h.allStars}
                </button>
              ))}
            </div>
            <div className="flex flex-wrap gap-1.5" role="group" aria-label={h.payNoteTitle}>
              {(["all", "online", "hotel"] as const).map((p) => (
                <button key={p} type="button" aria-pressed={payFilter === p} onClick={() => setPayFilter(p)} className={cx("h-8 rounded-full px-3 text-xs font-semibold ring-1 ring-inset", payFilter === p ? "bg-brand-700 text-white ring-brand-700" : "bg-white text-slate-700 ring-slate-200")} data-testid={`st-pay-${p}`}>
                  {h.payFilter[p]}
                </button>
              ))}
            </div>
          </div>
          {shown.length === 0 ? <Alert tone="info">{h.none}</Alert> : (
            <ul className="space-y-3">
              {shown.map((o) => <li key={o.id}><RateCard offer={o} when={when} onSelect={() => { setChosen(o); window.scrollTo({ top: 0, behavior: "smooth" }); }} /></li>)}
            </ul>
          )}
        </div>
      )}
    </StandaloneShell>
  );
}

function RateCard({ offer, selected, onSelect, when }: { offer: HotelOffer; selected?: boolean; onSelect?: () => void; when: (iso: string) => string }) {
  const { t, locale, money } = useApp();
  const h = t.standalone.hotels;
  const ar = locale === "ar";
  const hotelPay = offer.rate?.pay === "hotel";
  return (
    <Card className={cx("flex flex-col gap-3 p-4 sm:flex-row sm:items-center", selected && "ring-2 ring-brand-600/60")} data-testid="st-rate">
      <div className="grid size-12 shrink-0 place-items-center rounded-xl bg-brand-50 text-brand-700"><HotelIcon className="size-6" /></div>
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-2">
          <h3 className="font-bold">{ar ? offer.nameAr : offer.nameEn}</h3>
          <Stars n={offer.stars} />
          <Badge tone="slate">{offer.reviewScore.toFixed(1)}</Badge>
        </div>
        <p className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-slate-600">
          <span className="inline-flex items-center gap-1"><MapPinIcon className="size-3.5" />{ar ? offer.districtAr : offer.districtEn}</span>
          <span>{ar ? offer.roomTypeAr : offer.roomTypeEn} · {t.hotels.board[offer.board]}</span>
          <span>{t.common.agent}: {ar ? offer.agentNameAr : offer.agentNameEn}</span>
          <span className="ltr-nums">{h.license} {offer.licenseNo}</span>
        </p>
        <div className="mt-2 flex flex-wrap gap-1.5">
          <Badge tone={hotelPay ? "gold" : "brand"}><span data-testid="st-rate-pay">{hotelPay ? h.payHotel : h.payOnline}</span></Badge>
          <Badge tone={offer.rate?.freeCancelUntil ? "brand" : "slate"}>{offer.rate?.freeCancelUntil ? fmt(h.freeCancel, { date: when(offer.rate.freeCancelUntil) }) : h.nonRefundable}</Badge>
        </div>
      </div>
      <div className="flex items-end justify-between gap-3 sm:flex-col sm:items-end">
        <div className="text-end">
          <p className="ltr-nums text-lg font-bold text-brand-800">{money(offer.totalSAR)}</p>
          <p className="text-[11px] text-slate-500"><span className="ltr-nums">{money(offer.pricePerNightSAR)}</span> {h.perNight} · {fmt(h.nights, { n: offer.nights })}</p>
        </div>
        {onSelect && <Button size="sm" onClick={onSelect} data-testid="st-select">{h.select}</Button>}
      </div>
    </Card>
  );
}
