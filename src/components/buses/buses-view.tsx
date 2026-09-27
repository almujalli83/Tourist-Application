"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { fmt } from "@/i18n";
import { cityName } from "@/lib/data/cities";
import { COUNTRIES } from "@/lib/data/countries";
import { fmtKsa } from "@/lib/events/format";
import type { BusSeatMap, BusTrip } from "@/lib/buses/types";
import { useApp } from "../app-provider";
import { BusIcon } from "../icons";
import { Checkout, type PaymentRef } from "../payments/checkout";
import { Alert, Badge, Button, Card, cx, Field, Input, Select, Spinner } from "../ui";

interface PassengerOption { ref: string; nameEn: string; nationality: string; passportMasked: string }
type Pax = { type: "adult" | "child"; ref: string; nameEn: string; nationality: string; passportNo: string };
const pad = (n: number) => String(n).padStart(2, "0");
const ksaDay = (plus: number) => {
  const d = new Date(Date.now() + 3 * 3_600_000 + plus * 86_400_000);
  return `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}`;
};

/** Intercity bus tickets: search, trip, seats on the bus map, passengers, payment. */
export function BusesView() {
  const { t, locale, money, user } = useApp();
  const b = t.buses;
  const ar = locale === "ar";
  const router = useRouter();
  const [cities, setCities] = useState<string[]>([]);
  const [sample, setSample] = useState(false);
  const [q, setQ] = useState({ from: "RUH", to: "DMM", date: ksaDay(2), adults: 1, children: 0 });
  const [trips, setTrips] = useState<BusTrip[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [trip, setTrip] = useState<BusTrip | null>(null);
  const [map, setMap] = useState<BusSeatMap | null>(null);
  const [seats, setSeats] = useState<string[]>([]);
  const [options, setOptions] = useState<PassengerOption[]>([]);
  const [pax, setPax] = useState<Pax[]>([]);
  const [err, setErr] = useState<string | null>(null);
  const errText = (c?: string) => (b.errors as Record<string, string>)[c ?? ""] ?? b.errors.generic;
  const n = q.adults + q.children;

  useEffect(() => {
    fetch("/api/buses/cities").then((r) => r.json()).then((d) => { setCities(d.cities); setSample(d.operators.some((o: { sandbox: boolean }) => o.sandbox)); }).catch(() => undefined);
    if (user) fetch("/api/trains/passengers", { cache: "no-store" }).then((r) => (r.ok ? r.json() : { passengers: [] })).then((d) => setOptions(d.passengers)).catch(() => undefined);
  }, [user]);

  async function search() {
    setLoading(true);
    setErr(null);
    setTrip(null);
    const r = await fetch(`/api/buses/search?from=${q.from}&to=${q.to}&date=${q.date}`).catch(() => null);
    const d = await r?.json().catch(() => ({}));
    setLoading(false);
    if (!r?.ok) return setErr(errText(d?.error));
    setTrips(d.trips);
  }
  async function choose(x: BusTrip) {
    setTrip(x);
    setSeats([]);
    setMap(null);
    setPax(Array.from({ length: n }, (_, i) => ({ type: i < q.adults ? "adult" : "child", ref: "", nameEn: "", nationality: "", passportNo: "" })));
    const r = await fetch(`/api/buses/seats?providerId=${x.providerId}&tripId=${encodeURIComponent(x.id)}`).catch(() => null);
    const d = await r?.json().catch(() => ({}));
    if (!r?.ok) return setErr(errText(d?.error));
    setMap(d.seats);
  }
  const total = trip ? q.adults * trip.fare.adult + q.children * trip.fare.child : 0;
  async function pay(payment: PaymentRef | undefined): Promise<boolean> {
    if (!trip) return false;
    setErr(null);
    const r = await fetch("/api/buses/orders", {
      method: "POST", headers: { "content-type": "application/json" },
      body: JSON.stringify({
        providerId: trip.providerId, tripId: trip.id, from: trip.from, to: trip.to, date: q.date, seats, expectedTotalSAR: total, card: payment,
        passengers: pax.map((p) => (p.ref ? { type: p.type, ref: p.ref } : { type: p.type, nameEn: p.nameEn, nationality: p.nationality, passportNo: p.passportNo })),
      }),
    }).catch(() => null);
    const d = await r?.json().catch(() => ({}));
    if (!r?.ok) {
      if (d?.error === "seatTaken") void choose(trip);
      setErr(errText(d?.error));
      return false;
    }
    router.push(`/${locale}/account/buses/${d.order.id}`);
    return true;
  }
  const citySel = (id: string, v: string, on: (x: string) => void) => (
    <Select id={id} value={v} onChange={(e) => on(e.target.value)} data-testid={id}>
      {cities.map((c) => <option key={c} value={c}>{cityName(c, locale)}</option>)}
    </Select>
  );

  return (
    <div className="space-y-5" data-testid="buses-view">
      <div>
        <h1 className="flex items-center gap-2 text-2xl font-bold sm:text-3xl"><BusIcon className="size-7 text-brand-700" />{b.title}</h1>
        <p className="mt-1 max-w-3xl text-sm text-slate-600">{b.subtitle}</p>
      </div>
      <Card className="space-y-3 p-5">
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
          <Field label={b.from} htmlFor="bus-from">{citySel("bus-from", q.from, (v) => setQ({ ...q, from: v }))}</Field>
          <Field label={b.to} htmlFor="bus-to">{citySel("bus-to", q.to, (v) => setQ({ ...q, to: v }))}</Field>
          <Field label={b.date} htmlFor="bus-date"><Input id="bus-date" type="date" min={ksaDay(0)} value={q.date} onChange={(e) => setQ({ ...q, date: e.target.value })} data-testid="bus-date" /></Field>
          <Field label={b.adults} htmlFor="bus-ad"><Input id="bus-ad" type="number" min={1} max={9} value={q.adults} onChange={(e) => setQ({ ...q, adults: Math.max(1, Math.min(9, Number(e.target.value) || 1)) })} data-testid="bus-adults" /></Field>
          <Field label={b.children} htmlFor="bus-ch"><Input id="bus-ch" type="number" min={0} max={8} value={q.children} onChange={(e) => setQ({ ...q, children: Math.max(0, Math.min(9 - q.adults, Number(e.target.value) || 0)) })} /></Field>
        </div>
        <Button onClick={() => void search()} loading={loading} disabled={q.from === q.to} data-testid="bus-search">{b.search}</Button>
        {sample && <p className="text-xs font-semibold text-amber-700">{b.sample}</p>}
      </Card>
      {err && <Alert tone="error"><span data-testid="bus-error">{err}</span></Alert>}
      {trips && !trip && (trips.length === 0 ? <p className="text-sm text-slate-500">{b.noTrips}</p> : (
        <ul className="space-y-2">
          {trips.map((x) => (
            <li key={x.id}>
              <Card className="flex flex-wrap items-center gap-4 p-4" data-testid="bus-trip">
                <div className="min-w-0 flex-1">
                  <p className="text-lg font-bold" dir="ltr">{fmtKsa(x.depart, locale, { hour: "2-digit", minute: "2-digit" })} → {fmtKsa(x.arrive, locale, { hour: "2-digit", minute: "2-digit" })}</p>
                  <p className="text-xs text-slate-500">{cityName(x.from, locale)} {locale === "ar" ? "←" : "→"} {cityName(x.to, locale)} · {Math.floor(x.durationMins / 60)}:{pad(x.durationMins % 60)} · {x.tripNo}</p>
                </div>
                <Badge tone={x.cls === "vip" ? "gold" : "slate"}>{b.classes[x.cls]}</Badge>
                <span className="text-xs text-slate-500">{fmt(b.seatsLeft, { n: x.seatsLeft })}</span>
                <span className="text-end"><span className="ltr-nums block font-bold text-brand-800">{money(x.fare.adult)}</span><span className="text-[11px] text-slate-500">{b.perAdult}</span></span>
                <Button size="sm" onClick={() => void choose(x)} disabled={x.seatsLeft < n} data-testid="bus-choose">{b.choose}</Button>
              </Card>
            </li>
          ))}
        </ul>
      ))}
      {trip && (
        <div className="grid gap-4 lg:grid-cols-[auto_1fr]">
          <Card className="p-5">
            <h2 className="font-bold">{fmt(b.seatsTitle, { n })}</h2>
            {!map ? <Spinner /> : (
              <div className="mt-3 inline-block rounded-2xl border-2 border-slate-300 p-3" dir="ltr" data-testid="bus-map">
                <p className="mb-2 text-end text-[10px] font-semibold text-slate-500">{b.driver} ⎈</p>
                {Array.from({ length: map.rows }, (_, r) => (
                  <div key={r} className="mb-1.5 flex gap-1.5">
                    {map.letters.map((l, i) => {
                      const s = `${r + 1}${l}`;
                      const taken = map.taken.includes(s);
                      const mine = seats.includes(s);
                      return (
                        <span key={s} className="flex">
                          <button type="button" disabled={taken} aria-pressed={mine} title={taken ? b.seatTaken : s} data-testid={`bus-seat-${s}`}
                            onClick={() => setSeats(mine ? seats.filter((x) => x !== s) : seats.length < n ? [...seats, s] : [...seats.slice(1), s])}
                            className={cx("size-8 rounded-md text-[10px] font-bold", taken ? "cursor-not-allowed bg-slate-200 text-slate-500" : mine ? "bg-brand-700 text-white" : "bg-white text-slate-700 ring-1 ring-slate-300 hover:ring-brand-600")}>{s}</button>
                          {i + 1 === map.aisleAfter && <span className="w-4" />}
                        </span>
                      );
                    })}
                  </div>
                ))}
              </div>
            )}
          </Card>
          <Card className="space-y-4 p-5">
            <p className="text-sm font-semibold">{cityName(trip.from, locale)} {locale === "ar" ? "←" : "→"} {cityName(trip.to, locale)} · <span dir="ltr">{fmtKsa(trip.depart, locale, { weekday: "short", day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })}</span> · {b.classes[trip.cls]}</p>
            <h2 className="font-bold">{b.passengers}</h2>
            {!user ? (
              <Link href={`/${locale}/login?next=/${locale}/buses`} className="inline-flex h-11 items-center rounded-lg bg-brand-700 px-5 text-sm font-semibold text-white">{b.signIn}</Link>
            ) : (
              <>
                {pax.map((p, i) => (
                  <div key={i} className="space-y-2 rounded-xl bg-slate-50 p-3" data-testid="bus-passenger">
                    <p className="text-sm font-semibold">{fmt(b.passenger, { n: i + 1 })} · {p.type === "adult" ? b.adult : b.child}{seats[i] ? ` · ${fmt(b.seat, { seat: seats[i] })}` : ""}</p>
                    <Select aria-label={b.savedOrManual} value={p.ref} onChange={(e) => setPax(pax.map((x, j) => (j === i ? { ...x, ref: e.target.value } : x)))} data-testid="bus-pax-ref">
                      <option value="">{b.manual}</option>
                      {options.map((o) => <option key={o.ref} value={o.ref}>{o.nameEn} · {o.passportMasked}</option>)}
                    </Select>
                    {!p.ref && (
                      <div className="grid gap-2 sm:grid-cols-3">
                        <Input placeholder={b.nameEn} dir="ltr" value={p.nameEn} onChange={(e) => setPax(pax.map((x, j) => (j === i ? { ...x, nameEn: e.target.value } : x)))} data-testid="bus-pax-name" />
                        <Select aria-label={b.nationality} value={p.nationality} onChange={(e) => setPax(pax.map((x, j) => (j === i ? { ...x, nationality: e.target.value } : x)))} data-testid="bus-pax-nat">
                          <option value="">{b.nationality}</option>
                          {COUNTRIES.map((c) => <option key={c.iso2} value={c.iso2}>{ar ? c.ar : c.en}</option>)}
                        </Select>
                        <Input placeholder={b.passportNo} dir="ltr" value={p.passportNo} onChange={(e) => setPax(pax.map((x, j) => (j === i ? { ...x, passportNo: e.target.value } : x)))} data-testid="bus-pax-passport" />
                      </div>
                    )}
                  </div>
                ))}
                <p className="text-base font-bold">{b.total}: <span className="ltr-nums text-brand-800" data-testid="bus-total">{money(total)}</span></p>
                <p className="text-xs text-slate-500">{b.refundPolicy}</p>
                <div className="flex flex-wrap gap-2">
                  <Checkout amountSAR={total} description={`Bus ${trip.from}-${trip.to} ${trip.tripNo}`} disabled={seats.length !== n} label={b.pay} onPay={pay} testId="bus-pay" />
                  <Button variant="ghost" onClick={() => setTrip(null)}>{t.common.back}</Button>
                </div>
              </>
            )}
          </Card>
        </div>
      )}
    </div>
  );
}
