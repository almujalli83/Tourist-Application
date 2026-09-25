"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { fmt } from "@/i18n";
import { formatExpiryInput, parseExpiry } from "@/lib/card-expiry";
import { SAUDI_CITIES } from "@/lib/data/cities";
import { fmtKsa, ksaDay } from "@/lib/events/format";
import type { SeatSection } from "@/lib/events/types";
import { useApp } from "../app-provider";
import { BackLink } from "../back-link";
import { CalendarIcon, ClockIcon, LockIcon, MapPinIcon, TicketIcon } from "../icons";
import { Alert, Badge, Button, Card, cx, Field, Input, Spinner } from "../ui";
import { EVENT_COLORS, type EventSummary } from "./events-view";

interface Availability { unavailable: string[]; remaining: Record<string, number> }

const rowLetter = (i: number) => String.fromCharCode(65 + i);
const newKey = () => (typeof crypto !== "undefined" && "randomUUID" in crypto ? crypto.randomUUID() : `${Date.now()}-${Math.random()}`);

/** Event page: pick a date and time, seats (seat map) or tickets, and pay. */
export function EventDetail({ id }: { id: string }) {
  const { t, locale, money, user, currency } = useApp();
  const ev = t.events;
  const d = ev.details;
  const ar = locale === "ar";
  const router = useRouter();
  const [event, setEvent] = useState<EventSummary | null>(null);
  const [notFound, setNotFound] = useState(false);
  const [day, setDay] = useState<string | null>(null);
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [avail, setAvail] = useState<Availability | null>(null);
  const [seats, setSeats] = useState<string[]>([]);
  const [qty, setQty] = useState<Record<string, number>>({});
  const [card, setCard] = useState({ holder: "", number: "", exp: "", cvc: "" });
  const [paying, setPaying] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const key = useRef(newKey());

  useEffect(() => {
    fetch(`/api/events/${encodeURIComponent(id)}`, { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : Promise.reject()))
      .then((x: { event: EventSummary }) => {
        setEvent(x.event);
        const first = x.event.sessions[0];
        if (first) {
          setDay(ksaDay(first.start));
          setSessionId(first.id);
        }
      })
      .catch(() => setNotFound(true));
  }, [id]);

  const loadAvailability = useCallback(async (sid: string) => {
    setAvail(null);
    const r = await fetch(`/api/events/${encodeURIComponent(id)}/availability?session=${encodeURIComponent(sid)}`, { cache: "no-store" });
    const a: Availability | null = r.ok ? await r.json() : null;
    setAvail(a ?? { unavailable: [], remaining: {} });
    return a;
  }, [id]);

  useEffect(() => {
    if (!sessionId) return;
    setSeats([]);
    setQty({});
    setErr(null);
    key.current = newKey();
    void loadAvailability(sessionId);
  }, [sessionId, loadAvailability]);

  const days = useMemo(() => {
    const m = new Map<string, EventSummary["sessions"]>();
    for (const s of event?.sessions ?? []) m.set(ksaDay(s.start), [...(m.get(ksaDay(s.start)) ?? []), s]);
    return m;
  }, [event]);

  const lines = useMemo(() => {
    if (!event) return [];
    if (event.seating === "seated") {
      return seats.map((seat) => {
        const sec = event.sections!.find((s) => seat.startsWith(`${s.id}-`))!;
        return { label: `${ar ? sec.nameAr : sec.nameEn} · ${seat.slice(sec.id.length + 1)}`, price: sec.priceSAR };
      });
    }
    return (event.ticketTypes ?? []).filter((tt) => qty[tt.id]).map((tt) => ({ label: `${ar ? tt.nameAr : tt.nameEn} × ${qty[tt.id]}`, price: tt.priceSAR * qty[tt.id] }));
  }, [event, seats, qty, ar]);
  const count = event?.seating === "seated" ? seats.length : Object.values(qty).reduce((a, n) => a + n, 0);
  const total = Math.round(lines.reduce((a, l) => a + l.price, 0) * 100) / 100;

  if (notFound) return <Alert tone="error">{ev.errors.generic}</Alert>;
  if (!event) return <div className="grid min-h-[40vh] place-items-center text-brand-700"><Spinner className="size-8" /></div>;

  const city = SAUDI_CITIES.find((c) => c.code === event.city);
  const color = EVENT_COLORS[event.category];
  const session = event.sessions.find((s) => s.id === sessionId) ?? null;

  function toggleSeat(seat: string) {
    setErr(null);
    key.current = newKey();
    setSeats((cur) => (cur.includes(seat) ? cur.filter((s) => s !== seat) : cur.length >= event!.maxPerOrder ? cur : [...cur, seat]));
  }

  function changeQty(typeId: string, delta: number) {
    setErr(null);
    key.current = newKey();
    setQty((cur) => {
      const next = Math.max(0, (cur[typeId] ?? 0) + delta);
      const others = count - (cur[typeId] ?? 0);
      if (delta > 0 && (others + next > event!.maxPerOrder || next > (avail?.remaining[typeId] ?? 0))) return cur;
      return { ...cur, [typeId]: next };
    });
  }

  async function pay(e: React.FormEvent) {
    e.preventDefault();
    if (!session || !count) return;
    setPaying(true);
    setErr(null);
    try {
      const { expMonth, expYear } = parseExpiry(card.exp);
      const res = await fetch("/api/events/orders", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          eventId: event!.id, sessionId: session.id, seats, quantities: qty, expectedTotalSAR: total, idempotencyKey: key.current, displayCurrency: currency,
          card: { holder: card.holder, number: card.number.replace(/\s/g, ""), expMonth, expYear, cvc: card.cvc },
        }),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) {
        setErr((ev.errors as Record<string, string>)[body.error] ?? ev.errors.generic);
        key.current = newKey();
        if (body.error === "seatUnavailable" || body.error === "soldOut") {
          const a = await loadAvailability(session.id);
          if (a) setSeats((cur) => cur.filter((s) => !a.unavailable.includes(s)));
        }
        return;
      }
      router.push(`/${locale}/account/tickets/${body.order.id}?new=1`);
    } finally {
      setPaying(false);
    }
  }

  return (
    <div className="space-y-6">
      <BackLink href={`/${locale}/events`} label={d.back} />
      <div className="overflow-hidden rounded-2xl text-white shadow-sm" style={{ background: `linear-gradient(135deg, ${color}, ${color}cc 60%, #0b1f1a)` }}>
        <div className="p-6 sm:p-8">
          <p className="text-xs font-semibold uppercase tracking-wide opacity-90">{ev.categories[event.category]}</p>
          <h1 className="mt-1 text-2xl font-bold sm:text-3xl">{ar ? event.titleAr : event.titleEn}</h1>
          <p className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-sm opacity-90">
            <span className="inline-flex items-center gap-1"><MapPinIcon className="size-4" />{ar ? event.venueAr : event.venueEn}{city && ` · ${ar ? city.ar : city.en}`}</span>
            <span className="inline-flex items-center gap-1"><ClockIcon className="size-4" />{fmt(d.durationValue, { n: event.durationMins })}</span>
            <span className="inline-flex items-center gap-1"><TicketIcon className="size-4" />{fmt(ev.via, { provider: ev.providers[event.provider] })}</span>
          </p>
        </div>
      </div>

      <div className="grid gap-6 lg:grid-cols-[1fr_360px]">
        <div className="min-w-0 space-y-6">
          <Card className="p-5">
            <h2 className="font-bold">{d.about}</h2>
            <p className="mt-2 text-sm leading-7 text-slate-700">{ar ? event.descriptionAr : event.descriptionEn}</p>
            <div className="mt-3 flex flex-wrap gap-2">
              <Badge tone={event.refund.refundable ? "brand" : "slate"}>{d.policy}: {event.refund.refundable ? fmt(ev.refundable, { h: event.refund.cutoffHours }) : ev.final}</Badge>
              {event.minAge && <Badge tone="amber">{fmt(ev.minAge, { n: event.minAge })}</Badge>}
              <Link href={`/${locale}/guide?city=${event.city}&place=${encodeURIComponent(`event:${event.id}`)}`} className="inline-flex items-center gap-1 rounded-md px-2 py-0.5 text-xs font-semibold text-brand-700 hover:bg-brand-50">
                <MapPinIcon className="size-3.5" />{d.showOnMap}
              </Link>
            </div>
          </Card>

          {!event.sessions.length ? (
            <Alert tone="warning">{d.noSessions}</Alert>
          ) : (
            <Card className="space-y-4 p-5">
              <div>
                <h2 className="flex items-center gap-2 font-bold"><CalendarIcon className="size-5 text-brand-700" />{d.chooseDate}</h2>
                <div className="-mx-5 mt-3 flex gap-2 overflow-x-auto px-5 pb-1">
                  {[...days.keys()].map((k) => {
                    const first = days.get(k)![0].start;
                    return (
                      <button key={k} type="button" onClick={() => { setDay(k); setSessionId(days.get(k)![0].id); }} aria-pressed={day === k}
                        className={cx("flex w-16 shrink-0 flex-col items-center rounded-xl border py-2 text-center transition", day === k ? "border-brand-700 bg-brand-700 text-white" : "border-slate-200 bg-white hover:border-brand-500")}>
                        <span className="text-[11px] font-medium opacity-80">{fmtKsa(first, locale, { weekday: "short" })}</span>
                        <span className="text-lg font-bold leading-tight">{fmtKsa(first, locale, { day: "numeric" })}</span>
                        <span className="text-[11px] opacity-80">{fmtKsa(first, locale, { month: "short" })}</span>
                      </button>
                    );
                  })}
                </div>
              </div>
              {day && (days.get(day)?.length ?? 0) > 1 && (
                <div>
                  <h3 className="text-sm font-semibold">{d.chooseTime}</h3>
                  <div className="mt-2 flex flex-wrap gap-2">
                    {days.get(day)!.map((s) => (
                      <button key={s.id} type="button" onClick={() => setSessionId(s.id)} aria-pressed={sessionId === s.id}
                        className={cx("h-9 rounded-full border px-4 text-sm font-semibold", sessionId === s.id ? "border-brand-700 bg-brand-700 text-white" : "border-slate-300 hover:border-brand-500")}>
                        {fmtKsa(s.start, locale, { hour: "2-digit", minute: "2-digit" })}
                      </button>
                    ))}
                  </div>
                </div>
              )}
            </Card>
          )}

          {session && (
            <Card className="p-5">
              <div className="flex flex-wrap items-baseline justify-between gap-2">
                <h2 className="font-bold">{event.seating === "seated" ? d.chooseSeats : d.chooseTickets}</h2>
                <p className="text-xs text-slate-500">{fmt(d.maxPerOrder, { n: event.maxPerOrder })}</p>
              </div>
              {!avail ? (
                <p className="flex items-center gap-2 py-8 text-sm text-slate-500"><Spinner className="size-4" />{d.loading}</p>
              ) : event.seating === "seated" ? (
                <SeatMap sections={event.sections!} unavailable={avail.unavailable} selected={seats} onToggle={toggleSeat} full={seats.length >= event.maxPerOrder} />
              ) : (
                <ul className="mt-4 divide-y divide-slate-100">
                  {event.ticketTypes!.map((tt) => {
                    const left = avail.remaining[tt.id] ?? 0;
                    const n = qty[tt.id] ?? 0;
                    return (
                      <li key={tt.id} className="flex items-center justify-between gap-3 py-3" data-testid="ticket-type">
                        <div>
                          <p className="font-semibold">{ar ? tt.nameAr : tt.nameEn}</p>
                          <p className="text-sm text-brand-800">{money(tt.priceSAR)}</p>
                          <p className={cx("text-xs", left ? "text-slate-500" : "font-semibold text-red-600")}>{left ? fmt(d.remaining, { n: left }) : d.soldOut}</p>
                        </div>
                        <div className="flex items-center gap-2">
                          <button type="button" onClick={() => changeQty(tt.id, -1)} disabled={!n} aria-label={`${d.decrease} ${ar ? tt.nameAr : tt.nameEn}`} className="grid size-9 place-items-center rounded-full border border-slate-300 text-lg font-bold disabled:opacity-40">−</button>
                          <span className="w-6 text-center font-bold" aria-live="polite">{n}</span>
                          <button type="button" onClick={() => changeQty(tt.id, 1)} disabled={!left || n >= left || count >= event.maxPerOrder} aria-label={`${d.increase} ${ar ? tt.nameAr : tt.nameEn}`} className="grid size-9 place-items-center rounded-full border border-brand-700 text-lg font-bold text-brand-800 disabled:opacity-40">+</button>
                        </div>
                      </li>
                    );
                  })}
                </ul>
              )}
            </Card>
          )}
        </div>

        {/* Summary & payment */}
        <div className="lg:sticky lg:top-24 lg:self-start">
          <Card className="p-5">
            <h2 className="font-bold">{d.summary}</h2>
            {session && <p className="mt-1 text-sm text-slate-600">{fmtKsa(session.start, locale, { weekday: "long", day: "numeric", month: "long", hour: "2-digit", minute: "2-digit" })}</p>}
            {lines.length ? (
              <ul className="mt-3 space-y-1.5 text-sm" data-testid="order-lines">
                {lines.map((l, i) => <li key={i} className="flex justify-between gap-3"><span>{l.label}</span><span className="font-semibold">{money(l.price)}</span></li>)}
              </ul>
            ) : <p className="mt-3 text-sm text-slate-500">{d.noSelection}</p>}
            <div className="mt-3 flex justify-between border-t border-slate-100 pt-3 font-bold">
              <span>{d.total}</span><span className="text-brand-800" data-testid="order-total">{money(total)}</span>
            </div>
            {currency !== "SAR" && <p className="mt-1 text-xs text-slate-500">{t.review.chargedInSAR}</p>}

            {err && <Alert tone="error" className="mt-3">{err}</Alert>}

            {!user ? (
              <div className="mt-4 space-y-3">
                <p className="text-sm text-slate-600">{d.loginToBuy}</p>
                <Link href={`/${locale}/login?next=${encodeURIComponent(`/${locale}/events/${event.id}`)}`} className="inline-flex h-11 w-full items-center justify-center rounded-lg bg-brand-700 text-sm font-semibold text-white hover:bg-brand-800">{d.login}</Link>
              </div>
            ) : (
              <form onSubmit={pay} className="mt-4 space-y-3">
                <Field label={t.review.cardHolder} required>
                  <Input dir="ltr" autoComplete="cc-name" value={card.holder} onChange={(e) => setCard({ ...card, holder: e.target.value })} required />
                </Field>
                <Field label={t.review.cardNumber} required>
                  <Input dir="ltr" inputMode="numeric" autoComplete="cc-number" placeholder="0000 0000 0000 0000" value={card.number}
                    onChange={(e) => setCard({ ...card, number: e.target.value.replace(/[^\d ]/g, "").slice(0, 23) })} required />
                </Field>
                <div className="grid grid-cols-2 gap-3">
                  <Field label={t.review.expiry} required>
                    <Input dir="ltr" inputMode="numeric" autoComplete="cc-exp" placeholder="MM/YY" value={card.exp} onChange={(e) => setCard({ ...card, exp: formatExpiryInput(e.target.value).slice(0, 7) })} required />
                  </Field>
                  <Field label={t.review.cvc} required>
                    <Input dir="ltr" inputMode="numeric" autoComplete="cc-csc" type="password" value={card.cvc} onChange={(e) => setCard({ ...card, cvc: e.target.value.replace(/\D/g, "").slice(0, 4) })} required />
                  </Field>
                </div>
                <p className="text-xs text-slate-500">{t.review.testCards}</p>
                <Button type="submit" variant="gold" size="lg" className="w-full" loading={paying} disabled={!count || !session}>
                  <LockIcon className="size-5" />{paying ? d.paying : fmt(d.pay, { amount: money(total) })}
                </Button>
                <p className="text-xs text-slate-500">{d.holderNote}</p>
              </form>
            )}
          </Card>
        </div>
      </div>
    </div>
  );
}

/** Seat map: sections from the stage outwards; seat 1 on the left of each row. */
function SeatMap({ sections, unavailable, selected, onToggle, full }: {
  sections: SeatSection[]; unavailable: string[]; selected: string[]; onToggle: (seat: string) => void; full: boolean;
}) {
  const { t, locale, money } = useApp();
  const d = t.events.details;
  const ar = locale === "ar";
  const taken = useMemo(() => new Set(unavailable), [unavailable]);
  const tones = ["#b45309", "#0f766e", "#4338ca", "#be185d"];

  return (
    <div className="mt-4 space-y-4">
      <div className="flex flex-wrap gap-4 text-xs text-slate-600">
        <span className="inline-flex items-center gap-1.5"><span className="size-4 rounded border-2 border-brand-600 bg-white" />{d.legend.available}</span>
        <span className="inline-flex items-center gap-1.5"><span className="size-4 rounded bg-gold-500" />{d.legend.selected}</span>
        <span className="inline-flex items-center gap-1.5"><span className="size-4 rounded bg-slate-300" />{d.legend.unavailable}</span>
      </div>
      <div className="overflow-x-auto rounded-xl bg-slate-50 p-4" dir="ltr" data-testid="seat-map">
        <div className="mx-auto w-max min-w-full space-y-5">
          <div className="mx-auto w-3/4 rounded-b-[2rem] bg-slate-800 py-2 text-center text-xs font-semibold tracking-widest text-white" dir={ar ? "rtl" : "ltr"}>{d.stage}</div>
          {sections.map((sec, si) => (
            <div key={sec.id}>
              <p className="mb-2 text-center text-xs font-bold" style={{ color: tones[si % tones.length] }} dir={ar ? "rtl" : "ltr"}>
                {ar ? sec.nameAr : sec.nameEn} · {money(sec.priceSAR)}
              </p>
              <div className="space-y-1">
                {Array.from({ length: sec.rows }, (_, r) => (
                  <div key={r} className="flex items-center justify-center gap-1">
                    <span className="w-4 text-center text-[10px] font-semibold text-slate-400">{rowLetter(r)}</span>
                    {Array.from({ length: sec.seatsPerRow }, (_, k) => {
                      const id = `${sec.id}-${rowLetter(r)}${k + 1}`;
                      const isTaken = taken.has(id);
                      const isSel = selected.includes(id);
                      return (
                        <button
                          key={id}
                          type="button"
                          disabled={isTaken || (!isSel && full)}
                          onClick={() => onToggle(id)}
                          aria-pressed={isSel}
                          aria-label={`${fmt(d.row, { row: rowLetter(r) })} ${fmt(d.seat, { seat: k + 1 })} · ${ar ? sec.nameAr : sec.nameEn} · ${money(sec.priceSAR)}`}
                          title={`${rowLetter(r)}${k + 1}`}
                          data-seat={id}
                          className={cx(
                            "grid size-6 place-items-center rounded-t-md rounded-b-sm text-[9px] font-bold transition-colors sm:size-7",
                            isTaken ? "cursor-not-allowed bg-slate-300 text-slate-400" : isSel ? "bg-gold-500 text-white" : "border-2 bg-white text-slate-500 hover:bg-brand-50 disabled:cursor-not-allowed disabled:opacity-50",
                          )}
                          style={!isTaken && !isSel ? { borderColor: tones[si % tones.length] } : undefined}
                        >
                          {k + 1}
                        </button>
                      );
                    })}
                    <span className="w-4 text-center text-[10px] font-semibold text-slate-400">{rowLetter(r)}</span>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
