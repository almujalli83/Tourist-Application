"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { fmt } from "@/i18n";
import { cityName } from "@/lib/data/cities";
import type { Place } from "@/lib/guide/types";
import { METRO_LINES, type MetroLineId } from "@/lib/metro/types";
import { TOPUP_AMOUNTS, type Arrival, type Journey, type TransitProduct, type TransitTicket } from "@/lib/transit/types";
import { useApp } from "../app-provider";
import { BusIcon, LocateIcon, TicketIcon, TrainIcon } from "../icons";
import { MetroPanel } from "../metro/metro-panel";
import { Alert, Badge, Button, Card, cx, Field, Input, Select, Spinner } from "../ui";
import { CardFields, EMPTY_CARD, toCardInput, type CardDraft } from "./card-fields";
import { useTransitOperators, useTransitStops } from "./use-transit";

type Tab = "plan" | "live" | "tickets" | "map";
type Pt = { name: string; nameAr?: string; lat: number; lng: number };
const TABS: Tab[] = ["plan", "live", "tickets", "map"];
const nm = (p: { name: string; nameAr?: string }, locale: string) => (locale === "ar" ? p.nameAr || p.name : p.name);
const ksaNow = () => new Date(Date.now() + 3 * 3_600_000).toISOString().slice(0, 16);
const hhmm = (local: string) => local.slice(11, 16);

function useHere() {
  const [me, setMe] = useState<Pt | null>(null);
  const [busy, setBusy] = useState(false);
  const locate = useCallback((name: string) => {
    if (!navigator.geolocation) return;
    setBusy(true);
    navigator.geolocation.getCurrentPosition(
      (p) => { setMe({ name, lat: p.coords.latitude, lng: p.coords.longitude }); setBusy(false); },
      () => setBusy(false),
      { timeout: 10_000, maximumAge: 300_000 },
    );
  }, []);
  return { me, busy, locate };
}

/** Riyadh public transport inside the platform: journeys, live departures, tickets, top-ups, map. */
export function TransitPanel({ city = "RUH" }: { city?: string }) {
  const { t, locale } = useApp();
  const x = t.transit;
  const ops = useTransitOperators();
  const op = ops?.find((o) => o.city === city);
  const [tab, setTab] = useState<Tab>("plan");
  const [product, setProduct] = useState<string | null>(null);
  useEffect(() => setTab("plan"), [city]);
  if (!op) return null;
  const Icon = op.metro ? TrainIcon : BusIcon;
  return (
    <section className="space-y-3" data-testid="transit-panel">
      <div className="flex items-center gap-2">
        <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-brand-50 text-brand-700"><Icon className="size-5" /></span>
        <h2 className="text-lg font-bold">{fmt(op.metro ? x.titleMetro : x.titleBus, { city: cityName(city, locale) })}</h2>
      </div>
      <div className="flex flex-wrap gap-2" role="tablist">
        {TABS.filter((k) => k !== "map" || op.metro).map((k) => (
          <button key={k} type="button" role="tab" aria-selected={tab === k} onClick={() => setTab(k)} data-testid={`transit-tab-${k}`}
            className={cx("h-9 rounded-full border px-4 text-sm font-semibold", tab === k ? "border-brand-700 bg-brand-700 text-white" : "border-slate-300 bg-white text-slate-700 hover:border-brand-500")}>
            {x.tabs[k]}
          </button>
        ))}
      </div>
      {tab === "plan" && <JourneyPlanner city={city} onBuy={(p) => { setProduct(p); setTab("tickets"); }} />}
      {tab === "live" && <LiveDepartures city={city} />}
      {tab === "tickets" && <TransitTickets city={city} preselect={product} topUp={op.topUp} />}
      {tab === "map" && op.metro && <MetroPanel />}
    </section>
  );
}

type Choice = Pick<Place, "id" | "nameAr" | "nameEn" | "lat" | "lng">;

function PlacePicker({ id, label, value, onChange, places, me }: { id: string; label: string; value: Pt | null; onChange: (p: Pt | null) => void; places: Choice[]; me: ReturnType<typeof useHere> }) {
  const { t, locale } = useApp();
  const x = t.transit;
  const ar = locale === "ar";
  const [q, setQ] = useState("");
  const list = useMemo(() => {
    const n = q.trim().toLowerCase();
    return places.filter((p) => !n || `${p.nameAr} ${p.nameEn}`.toLowerCase().includes(n)).slice(0, 60);
  }, [places, q]);
  useEffect(() => {
    if (me.me && value?.name === x.myLocation) onChange({ ...me.me, name: x.myLocation, nameAr: x.myLocation });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [me.me]);
  return (
    <Field label={label} htmlFor={id}>
      <div className="space-y-1.5">
        <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder={x.searchPlace} data-testid={`${id}-search`} />
        <Select id={id} data-testid={id} value={value ? (value.name === x.myLocation ? "__me" : `${value.lat},${value.lng}`) : ""}
          onChange={(e) => {
            const v = e.target.value;
            if (v === "__me") {
              onChange(me.me ? { ...me.me, name: x.myLocation, nameAr: x.myLocation } : { name: x.myLocation, nameAr: x.myLocation, lat: NaN, lng: NaN });
              if (!me.me) me.locate(x.myLocation);
              return;
            }
            const p = places.find((pl) => `${pl.lat},${pl.lng}` === v);
            onChange(p ? { name: p.nameEn, nameAr: p.nameAr, lat: p.lat, lng: p.lng } : null);
          }}>
          <option value="">{x.choosePlace}</option>
          <option value="__me">📍 {x.myLocation}</option>
          {list.map((p) => <option key={p.id} value={`${p.lat},${p.lng}`}>{ar ? p.nameAr : p.nameEn}</option>)}
        </Select>
      </div>
    </Field>
  );
}

function usePlaces(city: string) {
  const [places, setPlaces] = useState<Place[]>([]);
  useEffect(() => {
    fetch(`/api/guide/places?city=${city}`).then((r) => r.json()).then((d) => setPlaces(d.places ?? [])).catch(() => setPlaces([]));
  }, [city]);
  return places;
}

const errOf = (t: ReturnType<typeof useApp>["t"], code: string | undefined) => (t.transit.errors as Record<string, string>)[code ?? ""] ?? t.transit.errors.generic;

export function JourneyPlanner({ city, onBuy }: { city: string; onBuy?: (productId: string) => void }) {
  const { t, locale } = useApp();
  const x = t.transit;
  const guide = usePlaces(city);
  const stops = useTransitStops(city);
  const places = useMemo<Choice[]>(() => [...(stops ?? []).map((st) => ({ ...st, id: `stop:${st.id}` })), ...guide], [stops, guide]);
  const me = useHere();
  const [from, setFrom] = useState<Pt | null>(null);
  const [to, setTo] = useState<Pt | null>(null);
  const [when, setWhen] = useState("");
  const [data, setData] = useState<Journey[] | null>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  async function plan() {
    setBusy(true);
    setErr(null);
    const r = await fetch("/api/transit/plan", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ city, from, to, departAt: when || ksaNow() }) }).catch(() => null);
    const d = await r?.json().catch(() => ({}));
    setBusy(false);
    if (!r?.ok) return setErr(errOf(t, d?.error));
    setData(d.journeys);
  }
  return (
    <Card className="space-y-4 p-5" data-testid="journey-planner">
      <div className="grid gap-3 md:grid-cols-[1fr_1fr_12rem]">
        <PlacePicker id="tp-from" label={x.from} value={from} onChange={setFrom} places={places} me={me} />
        <PlacePicker id="tp-to" label={x.to} value={to} onChange={setTo} places={places} me={me} />
        <Field label={x.when} htmlFor="tp-when"><Input id="tp-when" type="datetime-local" value={when} onChange={(e) => setWhen(e.target.value)} placeholder={x.now} /></Field>
      </div>
      <Button onClick={() => void plan()} loading={busy || me.busy} disabled={!from || !to || !Number.isFinite(from.lat) || !Number.isFinite(to.lat)} data-testid="tp-go">{x.planBtn}</Button>
      {err && <Alert tone="error">{err}</Alert>}
      {data && (data.length === 0 ? <p className="text-sm text-slate-500">{x.noJourneys}</p> : (
        <ol className="space-y-3">
          {data.map((j) => (
            <li key={j.id} className="rounded-xl border border-slate-200 p-4" data-testid="journey">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <p className="font-bold"><span dir="ltr">{hhmm(j.departAt)} → {hhmm(j.arriveAt)}</span> · {fmt(x.journey, { mins: j.mins, changes: j.changes ? x.changes : x.direct })}</p>
                <span className="flex flex-wrap gap-1">
                  {j.legs.filter((l) => l.mode !== "walk").map((l, i) => (
                    <span key={i} className="inline-flex items-center gap-1 rounded-md px-2 py-0.5 text-xs font-bold text-white" style={{ background: l.color ?? "#334155" }}>
                      {l.mode === "metro" ? <TrainIcon className="size-3.5" /> : <BusIcon className="size-3.5" />}{locale === "ar" ? l.lineNameAr : l.lineNameEn}
                    </span>
                  ))}
                </span>
              </div>
              <ul className="mt-3 space-y-1.5 border-s-2 border-slate-200 ps-3 text-sm">
                {j.legs.map((l, i) => l.mode === "walk" ? (
                  <li key={i} className="text-slate-500">🚶 {fmt(x.walk, { mins: l.mins })}</li>
                ) : (
                  <li key={i}>
                    <p className="font-semibold" style={{ color: l.color ?? undefined }}>{fmt(x.ride, { line: (locale === "ar" ? l.lineNameAr : l.lineNameEn) ?? "", headsign: (locale === "ar" ? l.headsignAr : null) ?? l.headsign ?? "", stops: l.stops })}</p>
                    <p className="text-xs text-slate-600">{fmt(x.board, { stop: nm(l.from, locale), time: hhmm(l.departAt) })} · {fmt(x.alight, { stop: nm(l.to, locale), time: hhmm(l.arriveAt) })}</p>
                  </li>
                ))}
              </ul>
              {j.productId && onBuy && <Button size="sm" variant="secondary" className="mt-3" onClick={() => onBuy(j.productId!)}><TicketIcon className="size-4" />{x.buyFor}</Button>}
            </li>
          ))}
        </ol>
      ))}
      <SampleNote city={city} />
    </Card>
  );
}

function SampleNote({ city }: { city: string }) {
  const { t } = useApp();
  const op = useTransitOperators()?.find((o) => o.city === city);
  return op?.sandbox ? <p className="text-xs font-semibold text-amber-700" data-testid="transit-sample">{t.transit.sample}</p> : null;
}

export function LiveDepartures({ city }: { city: string }) {
  const { t, locale } = useApp();
  const x = t.transit;
  const ar = locale === "ar";
  const stops = useTransitStops(city);
  const me = useHere();
  const [at, setAt] = useState<Pt | null>(null);
  const [list, setList] = useState<Arrival[] | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const load = useCallback(async (p: Pt) => {
    setErr(null);
    const r = await fetch(`/api/transit/arrivals?city=${city}&lat=${p.lat}&lng=${p.lng}`).catch(() => null);
    const d = await r?.json().catch(() => ({}));
    if (!r?.ok) return setErr(errOf(t, d?.error));
    setList(d.arrivals);
  }, [city, t]);
  useEffect(() => {
    if (me.me) setAt(me.me);
  }, [me.me]);
  useEffect(() => {
    if (!at) return;
    void load(at);
    const iv = setInterval(() => void load(at), 30_000);
    return () => clearInterval(iv);
  }, [at, load]);
  return (
    <Card className="space-y-4 p-5" data-testid="live-departures">
      <p className="text-sm text-slate-600">{x.liveIntro}</p>
      <div className="flex flex-wrap items-center gap-2">
        <Button variant="secondary" size="sm" onClick={() => me.locate(x.myLocation)} loading={me.busy} data-testid="live-locate"><LocateIcon className="size-4" />{x.myLocation}</Button>
        <Select aria-label={x.chooseStation} className="max-w-xs" value="" data-testid="live-station" onChange={(e) => {
          const s = stops?.find((st) => st.id === e.target.value);
          if (s) setAt({ name: s.nameEn, nameAr: s.nameAr, lat: s.lat, lng: s.lng });
        }}>
          <option value="">{x.chooseStation}</option>
          {stops?.map((s) => <option key={s.id} value={s.id}>{ar ? s.nameAr : s.nameEn}</option>)}
        </Select>
        {at && <span className="text-sm font-semibold">{x.liveNear}: {nm(at, locale)}</span>}
        {at && <button type="button" className="text-xs font-semibold text-brand-700 hover:underline" onClick={() => void load(at)}>{x.refresh}</button>}
      </div>
      {err && <Alert tone="error">{err}</Alert>}
      {list && (list.length === 0 ? <p className="text-sm text-slate-500">{x.noArrivals}</p> : (
        <ul className="divide-y divide-slate-100">
          {list.map((a, i) => (
            <li key={i} className="flex items-center gap-3 py-2.5" data-testid="arrival">
              <span className="inline-flex min-w-16 items-center justify-center gap-1 rounded-md px-2 py-1 text-xs font-bold text-white" style={{ background: a.color }}>
                {a.mode === "metro" ? <TrainIcon className="size-3.5" /> : <BusIcon className="size-3.5" />}{a.mode === "metro" ? METRO_LINES[Number(a.line) as MetroLineId]?.[ar ? "nameAr" : "nameEn"] ?? a.line : (ar ? a.lineNameAr : a.lineNameEn)}
              </span>
              <div className="min-w-0 flex-1 text-sm">
                <p className="font-semibold">{fmt(x.towards, { headsign: (ar ? a.headsignAr : null) ?? a.headsign })}</p>
                <p className="text-xs text-slate-500">{ar ? a.stopNameAr : a.stopName} · {a.realtime ? x.realtime : x.scheduled}</p>
              </div>
              <span className="text-sm font-bold tabular-nums text-brand-800">{a.inMins <= 0 ? x.arriving : fmt(x.inMins, { n: a.inMins })}</span>
            </li>
          ))}
        </ul>
      ))}
      <SampleNote city={city} />
    </Card>
  );
}

const validityText = (t: ReturnType<typeof useApp>["t"], mins: number) => (mins >= 1440 ? fmt(t.transit.days, { n: Math.round(mins / 1440) }) : fmt(t.transit.hours, { n: Math.round(mins / 60) }));

export function TransitTickets({ city, preselect, topUp = true }: { city: string; preselect?: string | null; topUp?: boolean }) {
  const { t, locale, money, user } = useApp();
  const x = t.transit;
  const ar = locale === "ar";
  const [data, setData] = useState<{ products: TransitProduct[]; operator: { nameAr: string; nameEn: string; sandbox: boolean } } | null>(null);
  const [pick, setPick] = useState<string | null>(preselect ?? null);
  const [qty, setQty] = useState(1);
  const [card, setCard] = useState<CardDraft>(EMPTY_CARD);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ tone: "success" | "error"; text: string } | null>(null);
  const [mine, setMine] = useState<TransitTicket[] | null>(null);
  const loadMine = useCallback(() => {
    if (!user) return;
    fetch("/api/transit/tickets", { cache: "no-store" }).then((r) => (r.ok ? r.json() : { tickets: [] })).then((d) => setMine(d.tickets)).catch(() => setMine([]));
  }, [user]);
  useEffect(() => {
    fetch(`/api/transit/products?city=${city}`).then((r) => (r.ok ? r.json() : null)).then((d) => {
      setData(d);
      if (d && !preselect) setPick(d.products[0]?.id ?? null);
    }).catch(() => setData(null));
    loadMine();
  }, [city, preselect, loadMine]);
  const product = data?.products.find((p) => p.id === pick);
  const total = product ? Math.round(product.priceSAR * qty * 100) / 100 : 0;
  async function buy() {
    setBusy(true);
    setMsg(null);
    const r = await fetch("/api/transit/tickets", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ city, productId: pick, qty, expectedTotalSAR: total, card: toCardInput(card) }) }).catch(() => null);
    const d = await r?.json().catch(() => ({}));
    setBusy(false);
    if (!r?.ok) return setMsg({ tone: "error", text: errOf(t, d?.error) });
    setMsg({ tone: "success", text: fmt(x.bought, { n: d.tickets.length }) });
    setCard(EMPTY_CARD);
    loadMine();
  }
  if (!data) return <Card className="grid h-32 place-items-center p-5 text-brand-700"><Spinner className="size-6" /></Card>;
  return (
    <div className="grid gap-4 lg:grid-cols-2">
      <Card className="space-y-4 p-5" data-testid="transit-tickets">
        <p className="text-sm text-slate-600">{x.ticketsIntro}</p>
        <div className="grid gap-2 sm:grid-cols-2">
          {data.products.map((p) => (
            <button key={p.id} type="button" aria-pressed={pick === p.id} onClick={() => setPick(p.id)} data-testid="transit-product"
              className={cx("rounded-xl p-3 text-start ring-1", pick === p.id ? "bg-brand-50 ring-2 ring-brand-600" : "bg-white ring-slate-200 hover:ring-brand-600")}>
              <span className="flex items-center justify-between gap-2"><span className="font-bold">{ar ? p.nameAr : p.nameEn}</span><span className="ltr-nums font-bold text-brand-800">{money(p.priceSAR)}</span></span>
              <span className="mt-1 block text-xs text-slate-500">{fmt(x.validity, { v: validityText(t, p.validityMins) })}</span>
            </button>
          ))}
        </div>
        {!user ? (
          <Link href={`/${locale}/login?next=/${locale}/transport?city=${city}`} className="inline-flex h-11 items-center rounded-lg bg-brand-700 px-5 text-sm font-semibold text-white">{x.signIn}</Link>
        ) : product && (
          <>
            <div className="flex flex-wrap items-end gap-4">
              <Field label={x.qty} htmlFor="tt-qty"><Input id="tt-qty" type="number" min={1} max={10} value={qty} onChange={(e) => setQty(Math.max(1, Math.min(10, Number(e.target.value) || 1)))} className="w-24" data-testid="transit-qty" /></Field>
              <p className="pb-2 text-base font-bold">{x.total}: <span className="ltr-nums text-brand-800" data-testid="transit-total">{money(total)}</span></p>
            </div>
            <CardFields card={card} onChange={setCard} />
            <Button loading={busy} onClick={() => void buy()} data-testid="transit-buy"><TicketIcon className="size-4" />{x.buy}</Button>
          </>
        )}
        {msg && <Alert tone={msg.tone}><span data-testid="transit-msg">{msg.text}</span></Alert>}
        {data.operator.sandbox && <p className="text-xs font-semibold text-amber-700">{x.sample}</p>}
        <p className="text-xs text-slate-500">{fmt(x.operator, { name: ar ? data.operator.nameAr : data.operator.nameEn })}</p>
      </Card>
      <div className="space-y-4">
        {user && (
          <Card className="space-y-2 p-5" data-testid="my-transit-tickets">
            <h3 className="font-bold">{x.myTickets}</h3>
            {!mine ? <Spinner /> : mine.length === 0 ? <p className="text-sm text-slate-500">{x.noTickets}</p> : (
              <ul className="divide-y divide-slate-100">
                {mine.slice(0, 8).map((k) => (
                  <li key={k.id} className="flex items-center justify-between gap-2 py-2 text-sm">
                    <span>{ar ? k.nameAr : k.nameEn} <span className="text-xs text-slate-500" dir="ltr">{k.reference}</span></span>
                    <span className="flex items-center gap-2">
                      <Badge tone={k.status === "active" ? "brand" : k.status === "unused" ? "amber" : "slate"}>{x.status[k.status]}</Badge>
                      <Link href={`/${locale}/account/transit/${k.id}`} className="font-semibold text-brand-700 hover:underline" data-testid="transit-ticket-link">QR</Link>
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </Card>
        )}
        {user && topUp && <TopUpCard city={city} />}
      </div>
    </div>
  );
}

function TopUpCard({ city }: { city: string }) {
  const { t, money } = useApp();
  const x = t.transit;
  const [cardNo, setCardNo] = useState("");
  const [amount, setAmount] = useState<number>(TOPUP_AMOUNTS[1]);
  const [card, setCard] = useState<CardDraft>(EMPTY_CARD);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ tone: "success" | "error"; text: string } | null>(null);
  async function go() {
    setBusy(true);
    setMsg(null);
    const r = await fetch("/api/transit/topups", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ city, cardNo, amountSAR: amount, card: toCardInput(card) }) }).catch(() => null);
    const d = await r?.json().catch(() => ({}));
    setBusy(false);
    if (!r?.ok) return setMsg({ tone: "error", text: errOf(t, d?.error) });
    setMsg({ tone: "success", text: fmt(x.topupDone, { amount: money(d.topup.amountSAR), balance: d.topup.balanceSAR != null ? fmt(x.balance, { amount: money(d.topup.balanceSAR) }) : "" }) });
    setCard(EMPTY_CARD);
  }
  return (
    <Card className="space-y-3 p-5" data-testid="transit-topup">
      <h3 className="font-bold">{x.topupTitle}</h3>
      <p className="text-sm text-slate-600">{x.topupIntro}</p>
      <Field label={x.cardNo} htmlFor="tu-no"><Input id="tu-no" dir="ltr" inputMode="numeric" value={cardNo} onChange={(e) => setCardNo(e.target.value.replace(/[^\d ]/g, "").slice(0, 24))} data-testid="topup-cardno" /></Field>
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-sm font-semibold">{x.amount}:</span>
        {TOPUP_AMOUNTS.map((a) => (
          <button key={a} type="button" aria-pressed={amount === a} onClick={() => setAmount(a)} className={cx("h-9 rounded-full border px-3 text-sm font-semibold", amount === a ? "border-brand-700 bg-brand-50 ring-1 ring-brand-700" : "border-slate-300")}>{money(a)}</button>
        ))}
      </div>
      <CardFields card={card} onChange={setCard} />
      <Button loading={busy} onClick={() => void go()} data-testid="topup-go">{x.topup}</Button>
      {msg && <Alert tone={msg.tone}><span data-testid="topup-msg">{msg.text}</span></Alert>}
    </Card>
  );
}
