"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import { fmt } from "@/i18n";
import { formatExpiryInput, parseExpiry } from "@/lib/card-expiry";
import { fmtKsa } from "@/lib/events/format";
import type { RestaurantBooking } from "@/lib/restaurants/bookings";
import type { Restaurant } from "@/lib/restaurants/catalog";
import { useApp } from "../app-provider";
import { BackLink } from "../back-link";
import { CalendarIcon, MapPinIcon } from "../icons";
import { PrintButton } from "../print-button";
import { Alert, Badge, Button, Card, Field, Input, Spinner } from "../ui";
import { SlotPicker } from "./shared";

interface View { booking: RestaurantBooking; qr: string; canCancel: boolean; canChange: boolean; cancelDeadline: string; changeDeadline: string }
const newKey = () => (typeof crypto !== "undefined" && "randomUUID" in crypto ? crypto.randomUUID() : `${Date.now()}-${Math.random()}`);

/** A table booking: QR code, change of date / time / guests and cancellation within the cut-offs. */
export function TableBookingView({ id }: { id: string }) {
  const { t, locale, money } = useApp();
  const rs = t.restaurants;
  const bk = rs.booking;
  const ar = locale === "ar";
  const [data, setData] = useState<View | null>(null);
  const [missing, setMissing] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [changing, setChanging] = useState(false);

  const load = useCallback(async () => {
    const r = await fetch(`/api/restaurants/bookings/${encodeURIComponent(id)}`, { cache: "no-store" });
    if (!r.ok) setMissing(true);
    else setData(await r.json());
  }, [id]);
  useEffect(() => {
    if (new URLSearchParams(window.location.search).has("new")) setNotice(bk.booked);
    void load();
  }, [load, bk.booked]);

  if (missing) return <Alert tone="error">{rs.errors.generic}</Alert>;
  if (!data) return <div className="grid min-h-[40vh] place-items-center text-brand-700"><Spinner className="size-8" /></div>;
  const b = data.booking;
  const cancelled = b.status === "CANCELLED";
  const when = fmtKsa(b.start, locale, { weekday: "long", day: "numeric", month: "long", year: "numeric", hour: "2-digit", minute: "2-digit" });
  const dl = (iso: string) => fmtKsa(iso, locale, { day: "numeric", month: "long", hour: "2-digit", minute: "2-digit" });

  async function cancel() {
    if (!confirm(bk.confirmCancel)) return;
    setBusy(true);
    setErr(null);
    try {
      const r = await fetch(`/api/restaurants/bookings/${encodeURIComponent(id)}/cancel`, { method: "POST" });
      const body = await r.json().catch(() => ({}));
      if (!r.ok) setErr((rs.errors as Record<string, string>)[body.error] ?? rs.errors.generic);
      else setNotice(null);
      await load();
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-6">
      <div className="print:hidden"><BackLink href={`/${locale}/account`} label={t.nav.myBookings} /></div>
      {notice && !cancelled && <Alert tone="success" className="print:hidden">{notice}</Alert>}
      {cancelled && <Alert tone="warning">{bk.cancelled}{b.cancellation?.refundSAR ? ` ${fmt(bk.refunded, { amount: money(b.cancellation.refundSAR) })}` : ""}</Alert>}
      {err && <Alert tone="error">{err}</Alert>}

      <div className="grid gap-6 lg:grid-cols-[1fr_320px]">
        <Card className="p-5">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <p className="text-xs font-semibold text-brand-700">{bk.title} · {rs.cuisines[b.restaurant.cuisine]}</p>
              <h1 className="mt-1 text-2xl font-bold">{ar ? b.restaurant.nameAr : b.restaurant.nameEn}</h1>
              <p className="mt-1 flex items-center gap-1 text-sm text-slate-600"><MapPinIcon className="size-4" />{ar ? b.restaurant.addressAr : b.restaurant.addressEn}</p>
            </div>
            <Badge tone={cancelled ? "red" : "brand"}>{bk.status[b.status]}</Badge>
          </div>
          <dl className="mt-4 grid gap-3 text-sm sm:grid-cols-2">
            <div><dt className="text-xs text-slate-500">{bk.when}</dt><dd className="flex items-center gap-1 font-semibold" data-testid="booking-when"><CalendarIcon className="size-4 text-slate-400" />{when}</dd></div>
            <div><dt className="text-xs text-slate-500">{bk.party}</dt><dd className="font-semibold" data-testid="booking-party">{b.party}</dd></div>
            <div><dt className="text-xs text-slate-500">{bk.guest}</dt><dd className="font-semibold">{b.guestName}</dd></div>
            <div><dt className="text-xs text-slate-500">{bk.reference}</dt><dd className="ltr-nums font-semibold">{b.reference} · {rs.providers[b.restaurant.provider]} {b.providerRef}</dd></div>
            <div className="sm:col-span-2">
              <dt className="text-xs text-slate-500">{rs.details.fee}</dt>
              <dd className="font-semibold" data-testid="booking-fee">{b.fee.paidSAR > 0 ? `${money(b.fee.paidSAR)} — ${bk.feeDeducted}` : bk.free}</dd>
            </div>
          </dl>

          {!cancelled && (
            <div className="mt-5 flex flex-wrap items-center gap-3 border-t border-slate-100 pt-4 print:hidden">
              <PrintButton label={bk.print} />
              {data.canChange && <Button variant="secondary" onClick={() => setChanging((c) => !c)}>{bk.change}</Button>}
              {data.canCancel && <Button variant="danger" onClick={cancel} loading={busy}>{bk.cancel}</Button>}
              <span className="text-xs text-slate-500">
                {data.canChange ? fmt(bk.changeUntil, { date: dl(data.changeDeadline) }) : bk.changeClosed}
                {" · "}
                {data.canCancel ? fmt(bk.cancelUntil, { date: dl(data.cancelDeadline) }) : bk.cancelClosed}
              </span>
            </div>
          )}

          {changing && data.canChange && (
            <ChangePanel booking={b} onDone={async () => { setChanging(false); setNotice(bk.changed); await load(); }} onClose={() => setChanging(false)} />
          )}

          {b.changes.length > 0 && (
            <div className="mt-5 border-t border-slate-100 pt-4">
              <h2 className="text-sm font-semibold">{bk.history}</h2>
              <ul className="mt-2 space-y-1 text-xs text-slate-600">
                {b.changes.map((c, i) => (
                  <li key={i} className="ltr-nums">{c.from.day} {c.from.time} ({c.from.party}) → {c.to.day} {c.to.time} ({c.to.party}){c.chargedSAR ? ` · +${money(c.chargedSAR)}` : ""}{c.refundedSAR ? ` · −${money(c.refundedSAR)}` : ""}</li>
                ))}
              </ul>
            </div>
          )}
        </Card>

        {!cancelled && (
          <Card className="flex flex-col items-center p-5 text-center" data-testid="booking-qr">
            <div className="size-48 [&>svg]:size-full" role="img" aria-label={b.code} dangerouslySetInnerHTML={{ __html: data.qr }} />
            <p className="ltr-nums mt-2 font-mono text-sm font-bold tracking-wider">{b.code}</p>
            <p className="mt-1 text-xs text-slate-500">{bk.showOnArrival}</p>
          </Card>
        )}
      </div>
      <p className="text-center print:hidden"><Link href={`/${locale}/restaurants`} className="text-sm font-semibold text-brand-700 hover:underline">{bk.browse}</Link></p>
    </div>
  );
}

function ChangePanel({ booking: b, onDone, onClose }: { booking: RestaurantBooking; onDone: () => Promise<void>; onClose: () => void }) {
  const { t, money } = useApp();
  const rs = t.restaurants;
  const bk = rs.booking;
  const [r, setR] = useState<Restaurant | null>(null);
  const [day, setDay] = useState(b.day);
  const [party, setParty] = useState(b.party);
  const [time, setTime] = useState<string | null>(b.time);
  const [card, setCard] = useState({ holder: "", number: "", exp: "", cvc: "" });
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const key = useRef(newKey());

  useEffect(() => {
    fetch(`/api/restaurants/${encodeURIComponent(b.restaurant.id)}`).then((x) => x.json()).then((x) => setR(x.restaurant));
  }, [b.restaurant.id]);

  const delta = Math.round((b.fee.perGuestSAR * party - b.fee.paidSAR) * 100) / 100;
  const unchanged = day === b.day && time === b.time && party === b.party;

  async function save(e: React.FormEvent) {
    e.preventDefault();
    if (!time) {
      setErr(rs.details.chooseTime);
      return;
    }
    setBusy(true);
    setErr(null);
    try {
      const { expMonth, expYear } = parseExpiry(card.exp);
      const res = await fetch(`/api/restaurants/bookings/${encodeURIComponent(b.id)}/change`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          day, time, party, expectedDeltaSAR: delta, idempotencyKey: key.current,
          card: delta > 0 ? { holder: card.holder, number: card.number.replace(/\s/g, ""), expMonth, expYear, cvc: card.cvc } : undefined,
        }),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) {
        setErr((rs.errors as Record<string, string>)[body.error] ?? rs.errors.generic);
        return;
      }
      await onDone();
    } finally {
      setBusy(false);
    }
  }

  if (!r) return <p className="mt-4 flex items-center gap-2 text-sm text-slate-500"><Spinner className="size-4" /></p>;
  return (
    <form onSubmit={save} className="mt-5 space-y-4 rounded-xl border border-brand-100 bg-brand-50/40 p-4 print:hidden" data-testid="change-panel">
      <SlotPicker restaurant={r} day={day} party={party} time={time} onDay={setDay} onParty={setParty} onTime={setTime} />
      {delta > 0 && (
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label={t.review.cardHolder} required className="sm:col-span-2"><Input dir="ltr" value={card.holder} onChange={(e) => setCard({ ...card, holder: e.target.value })} required /></Field>
          <Field label={t.review.cardNumber} required className="sm:col-span-2"><Input dir="ltr" inputMode="numeric" value={card.number} onChange={(e) => setCard({ ...card, number: e.target.value.replace(/[^\d ]/g, "").slice(0, 23) })} required /></Field>
          <Field label={t.review.expiry} required><Input dir="ltr" inputMode="numeric" placeholder="MM/YY" value={card.exp} onChange={(e) => setCard({ ...card, exp: formatExpiryInput(e.target.value).slice(0, 7) })} required /></Field>
          <Field label={t.review.cvc} required><Input dir="ltr" inputMode="numeric" type="password" value={card.cvc} onChange={(e) => setCard({ ...card, cvc: e.target.value.replace(/\D/g, "").slice(0, 4) })} required /></Field>
        </div>
      )}
      {delta < 0 && <p className="text-sm text-slate-600">{fmt(bk.refundDiff, { amount: money(-delta) })}</p>}
      {err && <Alert tone="error">{err}</Alert>}
      <div className="flex flex-wrap gap-2">
        <Button type="submit" loading={busy} disabled={unchanged || !time}>{delta > 0 ? fmt(bk.payDiff, { amount: money(delta) }) : bk.saveChange}</Button>
        <Button type="button" variant="ghost" onClick={onClose}>{bk.closeChange}</Button>
      </div>
    </form>
  );
}
