"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { fmt } from "@/i18n";
import { cityName, getCity } from "@/lib/data/cities";
import { fmtDay } from "@/lib/events/format";
import { flightAirportLegs, flightWindow, matchingStay, nextSteps } from "@/lib/standalone/next-steps";
import type { FlightOrder, StayOrder } from "@/lib/standalone/types";
import { useApp } from "../app-provider";
import { BackLink } from "../back-link";
import { PlaneIcon } from "../icons";
import { ReceiptLink } from "../payments/receipt-link";
import { PrintButton } from "../print-button";
import { Alert, Badge, Button, Card, Spinner } from "../ui";
import { CompleteTrip } from "./complete-trip";
import { errText } from "./shell";

interface Data { order: FlightOrder; cancel: { allowed: boolean; refundSAR: number } }

/** Flights booked without a package: e-tickets per passenger and flight, and cancellation. */
export function FlightView({ id }: { id: string }) {
  const { t, locale, money } = useApp();
  const s = t.standalone;
  const v = s.flight;
  const ar = locale === "ar";
  const [data, setData] = useState<Data | null | "missing">(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [stays, setStays] = useState<StayOrder[]>([]);
  useEffect(() => {
    fetch("/api/stays", { cache: "no-store" }).then((r) => (r.ok ? r.json() : { stays: [] })).then((d) => setStays(d.stays ?? [])).catch(() => undefined);
  }, []);
  const load = () => fetch(`/api/flights/${id}`, { cache: "no-store" }).then((r) => (r.ok ? r.json() : "missing")).then(setData).catch(() => setData("missing"));
  useEffect(() => void load(), [id]); // eslint-disable-line react-hooks/exhaustive-deps
  if (data === "missing") return <Alert tone="error">{s.errors.notFound}</Alert>;
  if (!data) return <div className="grid h-40 place-items-center text-brand-700"><Spinner className="size-6" /></div>;
  const o = data.order;
  const live = o.status === "confirmed";
  const day = (d: string) => fmtDay(d, locale, { weekday: "short", day: "numeric", month: "long", year: "numeric" });
  const airport = (code: string) => {
    const c = getCity(code);
    return c ? `${ar ? c.ar : c.en} (${code})` : code;
  };

  async function cancel() {
    if (!confirm(v.cancelConfirm)) return;
    setBusy(true);
    setErr(null);
    const r = await fetch(`/api/flights/${id}`, { method: "DELETE" });
    const d = await r.json().catch(() => ({}));
    setBusy(false);
    if (!r.ok) return setErr(errText(s.errors, d.error));
    await load();
  }

  const [first, second] = o.segments;
  // The city flown to (the transit city for a stopover) and every Saudi airport end fill in the next services.
  const trip = flightWindow(o);
  const stay = trip ? matchingStay(trip, stays) : undefined;
  const nowKsa = new Date(Date.now() + 3 * 3_600_000).toISOString().slice(0, 16);
  const legs = flightAirportLegs(o).filter((l) => l.at > nowKsa);
  const upcoming = legs.length > 0;
  const steps = trip
    ? nextSteps(trip, { stay: !!stay, flight: true, hotelName: stay ? (ar ? stay.hotel.nameAr : stay.hotel.nameEn) : undefined }, legs)
        // A stopover's hotel has its own button above.
        .filter((st) => !(st.key === "hotel" && o.tripType === "stopover"))
    : legs.map((leg) => ({ key: "transfer" as const, leg, href: `/transport?transfer=${leg.direction}&airport=${leg.airport}&flight=${leg.flightNo}&at=${leg.at}&pax=${Math.min(8, o.passengers.length)}#transfer` }));
  return (
    <div className="space-y-4" data-testid="flight-view">
      <BackLink href={`/${locale}/account`} label={t.account.title} />
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="flex items-center gap-2 text-2xl font-bold"><PlaneIcon className="size-6 text-brand-700" />{fmt(v.title, { ref: o.reference })}</h1>
        <Badge tone={live ? "brand" : "red"}><span data-testid="flight-status">{v.status[o.status]}</span></Badge>
      </div>
      {o.sandbox && <Alert tone="info">{v.sandbox}</Alert>}
      {err && <Alert tone="error">{err}</Alert>}
      <p className="text-sm text-slate-600">{s.entry.types[o.entry]} · {s.flights.trip[o.tripType]}</p>
      {o.segments.map((sg, i) => (
        <Card key={i} className="space-y-3 p-5 text-sm" data-testid="flight-segment">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <p className="text-base font-bold">
              {airport(sg.offer.from)} {ar ? "←" : "→"} {airport(sg.offer.to)}
            </p>
            <span className="ltr-nums font-semibold">{v.pnr}: <span data-testid="flight-pnr">{sg.pnr}</span></span>
          </div>
          <p className="text-slate-700">
            {day(sg.offer.departAt.slice(0, 10))} · <span className="ltr-nums">{sg.offer.departAt.slice(11, 16)} → {sg.offer.arriveAt.slice(11, 16)}</span> · {ar ? sg.offer.carrierNameAr : sg.offer.carrierNameEn} <span className="ltr-nums">{sg.offer.flightNo}</span>
            {" · "}{t.search.cabins[sg.offer.cabin]} · {fmt(s.flights.baggage, { kg: sg.offer.baggageKg })} · {sg.offer.refundable ? s.flights.refundable : s.flights.nonRefundable}
          </p>
          <table className="w-full text-sm">
            <thead><tr className="text-start text-xs text-slate-500"><th className="py-1 text-start font-medium">{s.flights.passengers}</th><th className="py-1 text-start font-medium">{v.ticket}</th></tr></thead>
            <tbody className="divide-y divide-slate-100">
              {o.passengers.map((p, j) => (
                <tr key={j}>
                  <td className="py-1.5"><span dir="ltr">{p.nameEn}</span> <span className="text-xs text-slate-500">· {s.flights.types[p.type]} · {s.flights.docTypes[p.docType]} <span dir="ltr">{p.docMasked}</span></span></td>
                  <td className="py-1.5 font-mono ltr-nums" data-testid="flight-ticket">{sg.tickets[j]}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <p className="text-xs text-slate-600">{fmt(v.airport, { h: o.scope === "domestic" ? 2 : 3 })}</p>
        </Card>
      ))}
      <Card className="space-y-2 p-5 text-sm">
        <p>{s.flights.total}: <span className="ltr-nums font-bold">{money(o.totalSAR)}</span></p>
        {o.loyalty?.earnedPoints ? <p className="font-medium text-gold-700">{fmt(v.points, { n: o.loyalty.earnedPoints })}</p> : null}
        <ReceiptLink transactionId={o.payment.transactionId} />
        {o.cancellation && <p className="font-semibold text-red-700" data-testid="flight-cancelled">{fmt(v.cancelled, { date: day(o.cancellation.at.slice(0, 10)), amount: money(o.cancellation.refundSAR) })}</p>}
        <div className="flex flex-wrap gap-2 pt-1 print:hidden">
          <PrintButton label={t.standalone.stay.print} />
          {live && o.tripType === "stopover" && second && (
            <Link href={`/${locale}/hotels?entry=stopover&city=${first.offer.to}&checkIn=${first.offer.arriveAt.slice(0, 10)}&checkOut=${second.offer.departAt.slice(0, 10)}`} className="inline-flex h-11 items-center rounded-lg bg-brand-700 px-4 text-sm font-semibold text-white hover:bg-brand-800" data-testid="flight-stopover-hotel">{v.stopoverHotel}</Link>
          )}
        </div>
      </Card>
      {live && upcoming && (
        <CompleteTrip
          testId="flight-complete"
          steps={steps}
          city={trip?.city} from={trip?.from} to={trip?.to}
          have={stay ? [{ label: fmt(s.next.yourHotel, { city: cityName(stay.hotel.city, locale), name: ar ? stay.hotel.nameAr : stay.hotel.nameEn }), href: `/account/stays/${stay.id}` }] : []}
        />
      )}
      {live && (
        <Card className="space-y-2 p-5 text-sm print:hidden">
          {data.cancel.allowed ? (
            <>
              <p>{data.cancel.refundSAR > 0 ? fmt(v.refund, { amount: money(data.cancel.refundSAR) }) : v.noRefund}</p>
              <Button variant="secondary" className="text-red-700" loading={busy} onClick={cancel} data-testid="flight-cancel">{v.cancel}</Button>
            </>
          ) : <p className="text-slate-600">{v.cannotCancel}</p>}
        </Card>
      )}
    </div>
  );
}
