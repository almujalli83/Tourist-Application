"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { fmt } from "@/i18n";
import { cityName } from "@/lib/data/cities";
import { fmtDay, fmtKsa } from "@/lib/events/format";
import { matchingFlight, nextSteps, stayWindow } from "@/lib/standalone/next-steps";
import type { FlightOrder, StayOrder } from "@/lib/standalone/types";
import type { HotelOffer } from "@/lib/types";
import { useApp } from "../app-provider";
import { BackLink } from "../back-link";
import { HotelIcon, MapPinIcon } from "../icons";
import { Checkout, type PaymentRef } from "../payments/checkout";
import { ReceiptLink } from "../payments/receipt-link";
import { PrintButton } from "../print-button";
import { RideMenu } from "../transport/ride-menu";
import { CompleteTrip } from "./complete-trip";
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
  const [flights, setFlights] = useState<FlightOrder[]>([]);
  const [siblings, setSiblings] = useState<StayOrder[]>([]);
  const load = () => fetch(`/api/stays/${id}`, { cache: "no-store" }).then((r) => (r.ok ? r.json() : "missing")).then(setData).catch(() => setData("missing"));
  useEffect(() => void load(), [id]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    fetch("/api/flights", { cache: "no-store" }).then((r) => (r.ok ? r.json() : { orders: [] })).then((d) => setFlights(d.orders ?? [])).catch(() => undefined);
    fetch("/api/stays", { cache: "no-store" }).then((r) => (r.ok ? r.json() : { stays: [] })).then((d) => setSiblings(d.stays ?? [])).catch(() => undefined);
  }, []);
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

  // The stay's city and dates (and its flights, when booked here) fill in the next services.
  const trip = stayWindow(o, flights);
  const flight = matchingFlight(trip, flights);
  const route = (f: FlightOrder) => f.segments.map((sg) => `${sg.offer.from}–${sg.offer.to}`).join(" · ");
  // A multi-city trip: the other hotels, the next city, and the flight home from the last one.
  const tripStays = o.trip ? siblings.filter((x) => x.trip?.id === o.trip!.id).sort((a, b) => a.trip!.index - b.trip!.index) : [];
  const nextStay = tripStays.find((x) => x.trip!.index === o.trip!.index + 1 && x.status === "confirmed");
  const lastOut = tripStays.filter((x) => x.status === "confirmed").reduce((d, x) => (x.hotel.checkOut > d ? x.hotel.checkOut : d), h.checkOut);

  return (
    <div className="space-y-4" data-testid="stay-view">
      <BackLink href={`/${locale}/account`} label={t.account.title} />
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="flex items-center gap-2 text-2xl font-bold"><HotelIcon className="size-6 text-brand-700" />{fmt(v.title, { ref: o.reference })}</h1>
        <Badge tone={live ? "brand" : "red"}><span data-testid="stay-status">{v.status[o.status]}</span></Badge>
      </div>
      {o.sandbox && <Alert tone="info">{v.sandbox}</Alert>}
      {o.trip && (
        <Card className="space-y-2 p-4 text-sm" data-testid="stay-trip">
          <p className="font-semibold">{fmt(s.multi.partOf, { ref: o.trip.reference, n: o.trip.index + 1, count: o.trip.count })}</p>
          {tripStays.length > 1 && (
            <ol className="space-y-1">
              {tripStays.map((x) => (
                <li key={x.id} className="flex flex-wrap items-center gap-2">
                  <span className="ltr-nums text-xs text-slate-500">{x.trip!.index + 1}.</span>
                  {x.id === o.id ? <span className="font-semibold">{cityName(x.hotel.city, locale)} — {ar ? x.hotel.nameAr : x.hotel.nameEn}</span>
                    : <Link href={`/${locale}/account/stays/${x.id}`} className="font-semibold text-brand-800 underline" data-testid="stay-trip-link">{cityName(x.hotel.city, locale)} — {ar ? x.hotel.nameAr : x.hotel.nameEn}</Link>}
                  <span className="text-xs text-slate-500">{day(x.hotel.checkIn)} — {day(x.hotel.checkOut)}</span>
                  {x.status !== "confirmed" && <Badge tone="red">{v.status[x.status]}</Badge>}
                </li>
              ))}
            </ol>
          )}
        </Card>
      )}
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

      {live && h.checkOut > new Date(Date.now() + 3 * 3_600_000).toISOString().slice(0, 10) && (
        <CompleteTrip
          testId="stay-complete"
          steps={nextSteps(trip, {
            stay: true, flight: !!flight || (o.trip?.index ?? 0) > 0, hotelName: ar ? h.nameAr : h.nameEn,
            ...(o.trip ? { backDate: lastOut } : {}),
            ...(nextStay ? { onward: { to: nextStay.hotel.city, date: nextStay.hotel.checkIn } } : {}),
          })}
          city={h.city} from={h.checkIn} to={h.checkOut}
          have={flight ? [{ label: fmt(s.next.yourFlight, { ref: flight.reference, route: route(flight) }), href: `/account/flights/${flight.id}` }] : []}
        />
      )}
    </div>
  );
}
