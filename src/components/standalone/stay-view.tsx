"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { fmt } from "@/i18n";
import { cityName } from "@/lib/data/cities";
import { fmtDay, fmtKsa } from "@/lib/events/format";
import type { StayOrder } from "@/lib/standalone/types";
import type { HotelOffer } from "@/lib/types";
import { useApp } from "../app-provider";
import { BackLink } from "../back-link";
import { HotelIcon, MapPinIcon } from "../icons";
import { Checkout, type PaymentRef } from "../payments/checkout";
import { ReceiptLink } from "../payments/receipt-link";
import { PrintButton } from "../print-button";
import { RideMenu } from "../transport/ride-menu";
import { Alert, Badge, Button, Card, Field, Input, Spinner, Stars } from "../ui";
import { errText } from "./shell";

interface Data { stay: StayOrder; cancel: { allowed: boolean; refundSAR: number; feeSAR: number } }

/** A hotel booked without a package: the voucher, cancellation, date changes and "complete your trip". */
export function StayView({ id }: { id: string }) {
  const { t, locale, money } = useApp();
  const s = t.standalone;
  const v = s.stay;
  const ar = locale === "ar";
  const [data, setData] = useState<Data | null | "missing">(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [changing, setChanging] = useState(false);
  const [dates, setDates] = useState({ checkIn: "", checkOut: "" });
  const [quote, setQuote] = useState<{ offer: HotelOffer; differenceSAR: number } | null>(null);
  const load = () => fetch(`/api/stays/${id}`, { cache: "no-store" }).then((r) => (r.ok ? r.json() : "missing")).then(setData).catch(() => setData("missing"));
  useEffect(() => void load(), [id]); // eslint-disable-line react-hooks/exhaustive-deps
  if (data === "missing") return <Alert tone="error">{s.errors.notFound}</Alert>;
  if (!data) return <div className="grid h-40 place-items-center text-brand-700"><Spinner className="size-6" /></div>;
  const o = data.stay;
  const h = o.hotel;
  const live = o.status === "confirmed";
  const day = (d: string) => fmtDay(d, locale, { weekday: "short", day: "numeric", month: "long", year: "numeric" });
  const when = (iso: string) => fmtKsa(iso, locale, { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });
  const guests = o.rooms.reduce((a, r) => a + r.adults + r.childAges.length, 0);

  async function cancel() {
    if (!confirm(v.cancelConfirm)) return;
    setBusy(true);
    setErr(null);
    const r = await fetch(`/api/stays/${id}`, { method: "DELETE" });
    const d = await r.json().catch(() => ({}));
    setBusy(false);
    if (!r.ok) return setErr(errText(s.errors, d.error));
    await load();
  }
  async function getQuote(e: React.FormEvent) {
    e.preventDefault();
    setErr(null);
    setQuote(null);
    const r = await fetch(`/api/stays/${id}/change?checkIn=${dates.checkIn}&checkOut=${dates.checkOut}`);
    const d = await r.json().catch(() => ({}));
    if (!r.ok) return setErr(errText(s.errors, d.error));
    setQuote(d);
  }
  async function applyChange(payment: PaymentRef | undefined): Promise<boolean> {
    if (!quote) return false;
    setErr(null);
    const r = await fetch(`/api/stays/${id}/change`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ offer: quote.offer, ...(payment ? { card: payment } : {}) }) });
    const d = await r.json().catch(() => ({}));
    if (!r.ok) {
      setErr(errText(s.errors, d.error));
      return false;
    }
    setChanging(false);
    setQuote(null);
    await load();
    return true;
  }

  const links = [
    { key: "transfer", href: `/transport?city=${h.city}` }, { key: "rental", href: `/transport?city=${h.city}#rental` }, { key: "events", href: `/events?city=${h.city}` },
    { key: "restaurants", href: `/restaurants?city=${h.city}` }, { key: "guides", href: `/guides?city=${h.city}` }, { key: "esim", href: "/esim" }, { key: "prayer", href: "/prayer" },
  ] as const;

  return (
    <div className="space-y-4" data-testid="stay-view">
      <BackLink href={`/${locale}/account`} label={t.account.title} />
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="flex items-center gap-2 text-2xl font-bold"><HotelIcon className="size-6 text-brand-700" />{fmt(v.title, { ref: o.reference })}</h1>
        <Badge tone={live ? "brand" : "red"}><span data-testid="stay-status">{v.status[o.status]}</span></Badge>
      </div>
      {o.sandbox && <Alert tone="info">{v.sandbox}</Alert>}
      {err && <Alert tone="error"><span data-testid="stay-error">{err}</span></Alert>}
      <Card className="space-y-3 p-5 text-sm">
        <div className="flex flex-wrap items-center gap-2">
          <p className="text-lg font-bold">{ar ? h.nameAr : h.nameEn}</p>
          <Stars n={h.stars} />
        </div>
        <p className="flex items-center gap-1 text-slate-600"><MapPinIcon className="size-4" />{ar ? h.districtAr : h.districtEn}{ar ? "، " : ", "}{cityName(h.city, locale)}</p>
        <dl className="grid gap-x-6 gap-y-2 sm:grid-cols-2">
          <div><dt className="text-xs text-slate-500">{v.confirmation}</dt><dd className="ltr-nums text-base font-bold" data-testid="stay-confirmation">{o.confirmation}</dd></div>
          <div><dt className="text-xs text-slate-500">{t.standalone.hotels.checkIn} / {t.standalone.hotels.checkOut}</dt><dd className="font-semibold">{day(h.checkIn)} — {day(h.checkOut)} ({fmt(t.standalone.hotels.nights, { n: h.nights })})</dd></div>
          <div><dt className="text-xs text-slate-500">{ar ? h.roomTypeAr : h.roomTypeEn} · {t.hotels.board[h.board]}</dt><dd>{fmt(v.guests, { rooms: o.rooms.length, n: guests })}</dd></div>
          <div><dt className="text-xs text-slate-500">{v.lead}</dt><dd>{o.lead.name} · <span dir="ltr">{o.lead.phone}</span></dd></div>
          <div><dt className="text-xs text-slate-500">{t.common.agent}</dt><dd>{ar ? h.agentNameAr : h.agentNameEn} · <span className="ltr-nums">{t.standalone.hotels.license} {h.licenseNo}</span></dd></div>
          <div>
            <dt className="text-xs text-slate-500">{v.payment}</dt>
            <dd className="font-semibold" data-testid="stay-pay">{o.pay === "online" ? fmt(v.paidOnline, { amount: money(o.payment?.amountSAR ?? o.totalSAR) }) : fmt(v.payAtHotel, { amount: money(o.totalSAR) })}</dd>
          </div>
        </dl>
        <p className="text-slate-700">{o.freeCancelUntil ? fmt(t.standalone.hotels.freeCancel, { date: when(o.freeCancelUntil) }) : t.standalone.hotels.nonRefundable}</p>
        {o.requests && <p className="text-slate-600">{t.standalone.hotels.requests}: {o.requests}</p>}
        {o.loyalty?.earnedPoints ? <p className="font-medium text-gold-700">{fmt(v.points, { n: o.loyalty.earnedPoints })}</p> : null}
        <ReceiptLink transactionId={o.payment?.transactionId} />
        {o.cancellation && <p className="font-semibold text-red-700" data-testid="stay-cancelled">{fmt(v.cancelled, { date: day(o.cancellation.at.slice(0, 10)), amount: money(o.cancellation.refundSAR) })}</p>}
        {o.changes.length > 0 && (
          <div>
            <p className="text-xs font-semibold text-slate-500">{v.changes}</p>
            <ul className="text-xs text-slate-600">{o.changes.map((c) => <li key={c.at}>{fmt(v.changeLine, { from: `${c.from.checkIn}–${c.from.checkOut}`, to: `${c.to.checkIn}–${c.to.checkOut}`, date: day(c.at.slice(0, 10)) })}</li>)}</ul>
          </div>
        )}
        <div className="flex flex-wrap gap-2 pt-1 print:hidden">
          {typeof h.lat === "number" && typeof h.lng === "number" && live && <RideMenu to={{ lat: h.lat, lng: h.lng, name: ar ? h.nameAr : h.nameEn }} />}
          <PrintButton label={v.print} />
        </div>
      </Card>

      {live && (
        <Card className="space-y-3 p-5 print:hidden">
          {data.cancel.allowed && (
            <div className="space-y-1 text-sm">
              {data.cancel.refundSAR > 0 && <p>{fmt(v.refund, { amount: money(data.cancel.refundSAR) })}</p>}
              {data.cancel.feeSAR > 0 && <p className="text-amber-800">{o.pay === "hotel" ? fmt(v.hotelFee, { amount: money(data.cancel.feeSAR) }) : fmt(v.fee, { amount: money(data.cancel.feeSAR) })}</p>}
            </div>
          )}
          <div className="flex flex-wrap gap-2">
            {data.cancel.allowed ? <Button variant="secondary" className="text-red-700" loading={busy} onClick={cancel} data-testid="stay-cancel">{v.cancel}</Button> : <p className="text-sm text-slate-600">{v.cannotCancel}</p>}
            {o.freeCancelUntil && Date.parse(o.freeCancelUntil) > Date.now() && !changing && <Button variant="secondary" onClick={() => { setChanging(true); setDates({ checkIn: h.checkIn, checkOut: h.checkOut }); }} data-testid="stay-change">{v.change}</Button>}
          </div>
          {changing && (
            <div className="space-y-3 rounded-xl bg-slate-50 p-4">
              <form onSubmit={getQuote} className="flex flex-wrap items-end gap-3">
                <Field label={t.standalone.hotels.checkIn}><Input type="date" dir="ltr" value={dates.checkIn} onChange={(e) => setDates({ ...dates, checkIn: e.target.value })} data-testid="stay-new-in" /></Field>
                <Field label={t.standalone.hotels.checkOut}><Input type="date" dir="ltr" value={dates.checkOut} onChange={(e) => setDates({ ...dates, checkOut: e.target.value })} data-testid="stay-new-out" /></Field>
                <Button type="submit" size="sm" data-testid="stay-quote">{v.quote}</Button>
              </form>
              {quote && (
                <div className="space-y-2 text-sm" data-testid="stay-quote-result">
                  <p className="text-slate-600">{v.sameHotel}</p>
                  <p className="font-semibold">{quote.differenceSAR > 0 ? fmt(v.difference, { amount: money(quote.differenceSAR) }) : quote.differenceSAR < 0 ? fmt(v.refundDiff, { amount: money(-quote.differenceSAR) }) : v.noDifference}</p>
                  {o.pay === "online" && quote.differenceSAR > 0
                    ? <Checkout amountSAR={quote.differenceSAR} description={`Hotel date change ${o.reference}`} onPay={applyChange} testId="stay-change-pay" />
                    : <Button size="sm" onClick={() => void applyChange(undefined)} data-testid="stay-change-confirm">{v.confirmChange}</Button>}
                </div>
              )}
            </div>
          )}
        </Card>
      )}

      {live && (
        <Card className="space-y-3 p-5 print:hidden" data-testid="stay-complete">
          <h2 className="font-bold">{v.complete}</h2>
          <div className="flex flex-wrap gap-2">
            {links.map((l) => <Link key={l.key} href={`/${locale}${l.href}`} className="inline-flex h-9 items-center rounded-lg bg-white px-3 text-sm font-semibold text-brand-800 ring-1 ring-inset ring-brand-700/25 hover:bg-brand-50">{v.completeLinks[l.key]}</Link>)}
          </div>
        </Card>
      )}
    </div>
  );
}
