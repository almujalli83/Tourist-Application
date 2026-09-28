"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";
import { fmt } from "@/i18n";
import { cityName, MAKKAH, SAUDI_CITIES, UMRAH_CITY } from "@/lib/data/cities";
import { fmtDay, fmtKsa } from "@/lib/events/format";
import { earnPoints } from "@/lib/loyalty/rules";
import type { EntryType } from "@/lib/standalone/entry";
import type { HotelOffer, RoomOccupancy } from "@/lib/types";
import { useApp } from "../app-provider";
import { GuestsRoomsPicker } from "../booking/guests-rooms-picker";
import { XIcon } from "../icons";
import { Checkout, type PaymentRef } from "../payments/checkout";
import { Alert, Badge, Button, Card, cx, Field, Input, Select, Spinner } from "../ui";
import { LeadFields, useLeadForm } from "./lead-form";
import { RateCard } from "./rate-card";
import { errText } from "./shell";

const MAX_CITIES = 5;
const MAX_NIGHTS = 30;
const STOPOVER_NIGHTS = 4;
const addDays = (day: string, n: number) => new Date(Date.parse(`${day}T00:00:00Z`) + n * 86_400_000).toISOString().slice(0, 10);
const ksaToday = () => new Date(Date.now() + 3 * 3_600_000).toISOString().slice(0, 10);

interface Leg { city: string; nights: number }
interface LegState { offers: HotelOffer[] | null; chosen: HotelOffer | null; loading: boolean; error: string | null }
const empty = (): LegState => ({ offers: null, chosen: null, loading: false, error: null });

/**
 * Hotels in several cities in one go: the cities in order with their nights (the dates follow on),
 * a hotel chosen in each, one payment for the prepaid rates. Booked all or nothing — a hotel that
 * can't be confirmed is the only one to replace; the other choices stay.
 */
export function MultiCityHotels({ entry }: { entry: EntryType }) {
  const { t, locale, money, user } = useApp();
  const s = t.standalone;
  const m = s.multi;
  const h = s.hotels;
  const ar = locale === "ar";
  const router = useRouter();
  const [start, setStart] = useState(addDays(ksaToday(), 7));
  const [legs, setLegs] = useState<Leg[]>([{ city: "RUH", nights: 3 }, { city: "JED", nights: 2 }]);
  const [rooms, setRooms] = useState<RoomOccupancy[]>([{ adults: 2, childAges: [] }]);
  const [umrah, setUmrah] = useState(false);
  const [state, setState] = useState<LegState[]>([]);
  const [active, setActive] = useState(0);
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const form = useLeadForm();

  const dates = useMemo(() => {
    let d = start;
    return legs.map((l) => {
      const from = d;
      d = addDays(d, l.nights);
      return { checkIn: from, checkOut: d };
    });
  }, [start, legs]);
  const totalNights = legs.reduce((a, l) => a + l.nights, 0);
  const problem = legs.some((l, i) => i > 0 && l.city === legs[i - 1].city) ? m.sameCity
    : totalNights > MAX_NIGHTS ? m.maxNights
    : entry === "stopover" && totalNights > STOPOVER_NIGHTS ? h.stopoverMax
    : null;
  const cities = [...SAUDI_CITIES, MAKKAH];
  const day = (d: string) => fmtDay(d, locale, { day: "numeric", month: "short" });
  const when = (iso: string) => fmtKsa(iso, locale, { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });

  // Any change to the plan clears the results (the offers are signed for exact cities and dates).
  const edit = (next: Leg[]) => {
    setLegs(next);
    setState([]);
  };
  const patch = (i: number, p: Partial<LegState>) => setState((cur) => cur.map((x, j) => (j === i ? { ...x, ...p } : x)));

  async function fetchLeg(i: number): Promise<HotelOffer[] | null> {
    const params = new URLSearchParams({ city: legs[i].city, checkIn: dates[i].checkIn, checkOut: dates[i].checkOut, rooms: JSON.stringify(rooms), entry, ...(legs[i].city === UMRAH_CITY && umrah ? { umrah: "1" } : {}) });
    const r = await fetch(`/api/stays/search?${params}`).catch(() => null);
    const d = await r?.json().catch(() => ({}));
    if (!r?.ok) {
      patch(i, { loading: false, offers: null, error: errText(s.errors, d?.error) });
      return null;
    }
    patch(i, { loading: false, offers: d.offers, error: null });
    return d.offers;
  }

  async function search(e?: React.FormEvent) {
    e?.preventDefault();
    setErr(null);
    if (problem) return setErr(problem);
    if (legs.some((l) => l.city === UMRAH_CITY) && !umrah) return setErr(s.errors.makkahMuslimsOnly);
    setState(legs.map(() => ({ ...empty(), loading: true })));
    setActive(0);
    await Promise.all(legs.map((_, i) => fetchLeg(i)));
  }

  function choose(i: number, offer: HotelOffer) {
    patch(i, { chosen: offer, error: null });
    const next = state.findIndex((x, j) => j !== i && !x.chosen);
    if (next >= 0) setActive(next);
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  const chosen = state.map((x) => x.chosen);
  const complete = state.length === legs.length && chosen.every(Boolean);
  const payNow = chosen.reduce((a, o) => a + (o && o.rate?.pay === "online" ? o.totalSAR : 0), 0);
  const atHotels = chosen.reduce((a, o) => a + (o && o.rate?.pay === "hotel" ? o.totalSAR : 0), 0);
  const points = payNow > 0 && user?.accountType === "individual" ? chosen.reduce((a, o) => a + (o && o.rate?.pay === "online" ? earnPoints({ service: "stay", eligibleSAR: o.totalSAR }) : 0), 0) : 0;

  async function book(payment: PaymentRef | undefined): Promise<boolean> {
    if (!complete) return false;
    setErr(null);
    setBusy(true);
    const r = await fetch("/api/stays/trip", {
      method: "POST", headers: { "content-type": "application/json" },
      body: JSON.stringify({
        entry, rooms, umrah, lead: form.lead, requests: form.requests,
        legs: legs.map((l, i) => ({ offer: chosen[i], city: l.city, checkIn: dates[i].checkIn, checkOut: dates[i].checkOut, expectedTotalSAR: chosen[i]!.totalSAR })),
        ...(payment ? { card: payment } : {}),
      }),
    }).catch(() => null);
    const d = await r?.json().catch(() => ({}));
    setBusy(false);
    if (r?.ok) {
      router.push(`/${locale}/account/stays/${d.stays[0].id}`);
      return true;
    }
    const leg = typeof d?.details?.leg === "number" ? (d.details.leg as number) : null;
    if (leg === null || leg >= legs.length) {
      setErr(errText(s.errors, d?.error));
      return false;
    }
    // Only this city is to replace: the refused hotel leaves the list; an expired or changed offer is searched again.
    const failed = chosen[leg]!;
    const city = cityName(legs[leg].city, locale);
    setActive(leg);
    if (d.error === "agentRejected" || d.error === "agentUnavailable") {
      patch(leg, { chosen: null, offers: (state[leg].offers ?? []).filter((o) => o.id !== failed.id) });
      setErr(fmt(m.legFailed, { hotel: ar ? failed.nameAr : failed.nameEn, city }));
    } else {
      patch(leg, { chosen: null, loading: true });
      setErr(fmt(m.legChanged, { city }));
      await fetchLeg(leg);
    }
    return false;
  }

  const cur = state[active];
  return (
    <div className="space-y-4" data-testid="mc">
      <Card className="space-y-4 p-4 sm:p-5">
        <p className="text-sm text-slate-600">{m.intro}</p>
        <form onSubmit={search} className="space-y-3" noValidate>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-[1fr_1.4fr]">
            <Field label={m.start} htmlFor="mc-start"><Input id="mc-start" type="date" dir="ltr" min={ksaToday()} value={start} onChange={(e) => { setStart(e.target.value); setState([]); }} data-testid="mc-start" /></Field>
            <Field label={h.guests}><GuestsRoomsPicker value={rooms} onChange={(v) => { setRooms(v); setState([]); }} /></Field>
          </div>
          <ol className="space-y-2">
            {legs.map((l, i) => (
              <li key={i} className="grid grid-cols-[1fr_6rem_auto] items-end gap-2 sm:grid-cols-[1.3fr_7rem_1fr_auto]" data-testid="mc-leg">
                <Field label={fmt(m.city, { n: i + 1 })} htmlFor={`mc-city-${i}`}>
                  <Select id={`mc-city-${i}`} value={l.city} onChange={(e) => edit(legs.map((x, j) => (j === i ? { ...x, city: e.target.value } : x)))} data-testid={`mc-city-${i}`}>
                    {cities.map((c) => <option key={c.code} value={c.code}>{ar ? c.ar : c.en}</option>)}
                  </Select>
                </Field>
                <Field label={m.nights} htmlFor={`mc-nights-${i}`}>
                  <Select id={`mc-nights-${i}`} value={l.nights} onChange={(e) => edit(legs.map((x, j) => (j === i ? { ...x, nights: Number(e.target.value) } : x)))} data-testid={`mc-nights-${i}`}>
                    {Array.from({ length: 14 }, (_, k) => k + 1).map((n) => <option key={n} value={n}>{n}</option>)}
                  </Select>
                </Field>
                <p className="hidden pb-3 text-xs text-slate-600 sm:block">{day(dates[i].checkIn)} — {day(dates[i].checkOut)}</p>
                <button type="button" disabled={legs.length <= 2} onClick={() => edit(legs.filter((_, j) => j !== i))} aria-label={fmt(m.remove, { city: cityName(l.city, locale) })}
                  className="mb-1.5 grid size-9 place-items-center rounded-lg text-slate-500 hover:bg-slate-100 disabled:opacity-30"><XIcon className="size-4" /></button>
              </li>
            ))}
          </ol>
          {legs.some((l) => l.city === UMRAH_CITY) && (
            <label className="flex items-start gap-2 text-sm">
              <input type="checkbox" checked={umrah} onChange={(e) => setUmrah(e.target.checked)} className="mt-0.5 size-4 accent-brand-700" />{h.makkahConfirm}
            </label>
          )}
          {problem && <p className="text-sm text-amber-800" role="status">{problem}</p>}
          <div className="flex flex-wrap gap-2">
            {legs.length < MAX_CITIES && (
              <Button type="button" variant="secondary" data-testid="mc-add" onClick={() => {
                const used = new Set([legs[legs.length - 1].city]);
                const next = cities.find((c) => !legs.some((l) => l.city === c.code) && c.code !== UMRAH_CITY) ?? cities.find((c) => !used.has(c.code))!;
                edit([...legs, { city: next.code, nights: 2 }]);
              }}>{m.add}</Button>
            )}
            <Button type="submit" disabled={!!problem} loading={state.some((x) => x.loading)} data-testid="mc-search">{m.search}</Button>
          </div>
        </form>
      </Card>

      {err && <Alert tone="error"><span data-testid="mc-error">{err}</span></Alert>}

      {state.length === legs.length && (
        <div className="grid gap-5 lg:grid-cols-[1fr_380px]">
          <div className="space-y-4">
            <div className="flex flex-wrap gap-2" role="tablist" aria-label={m.tabs}>
              {legs.map((l, i) => (
                <button key={i} type="button" role="tab" aria-selected={active === i} onClick={() => setActive(i)} data-testid={`mc-tab-${i}`}
                  className={cx("rounded-xl px-3 py-2 text-start text-sm ring-1 ring-inset", active === i ? "bg-brand-700 text-white ring-brand-700" : "bg-white text-slate-700 ring-slate-200")}>
                  <span className="block font-semibold">{i + 1}. {cityName(l.city, locale)} {state[i].chosen && "✓"}</span>
                  <span className={cx("block text-xs", active === i ? "text-white/80" : "text-slate-500")}>{day(dates[i].checkIn)} — {day(dates[i].checkOut)}</span>
                </button>
              ))}
            </div>
            {cur && (
              <section className="space-y-3" aria-live="polite">
                <h2 className="font-bold">{fmt(m.choose, { city: cityName(legs[active].city, locale) })}</h2>
                {cur.loading ? <div className="grid place-items-center py-10 text-brand-700"><Spinner className="size-6" /></div>
                  : cur.error ? <Alert tone="error">{cur.error}</Alert>
                  : cur.offers && cur.offers.length === 0 ? <Alert tone="info">{h.none}</Alert>
                  : (
                    <ul className="space-y-3">
                      {(cur.offers ?? []).map((o) => (
                        <li key={o.id}><RateCard offer={o} when={when} selected={cur.chosen?.id === o.id} onSelect={() => choose(active, o)} /></li>
                      ))}
                    </ul>
                  )}
              </section>
            )}
          </div>

          <Card className="h-fit space-y-4 p-5 lg:sticky lg:top-20" data-testid="mc-summary">
            <h2 className="font-bold">{m.summary}</h2>
            <ol className="space-y-2 text-sm">
              {legs.map((l, i) => {
                const o = state[i].chosen;
                return (
                  <li key={i} className="flex items-start justify-between gap-2" data-testid="mc-summary-leg">
                    <div className="min-w-0">
                      <p className="font-semibold">{cityName(l.city, locale)} <span className="text-xs font-normal text-slate-500">· {day(dates[i].checkIn)} — {day(dates[i].checkOut)}</span></p>
                      {o ? <p className="truncate text-xs text-slate-600">{ar ? o.nameAr : o.nameEn} · <Badge tone={o.rate?.pay === "hotel" ? "gold" : "brand"}>{o.rate?.pay === "hotel" ? h.payHotel : h.payOnline}</Badge></p>
                        : <button type="button" className="text-xs font-semibold text-amber-800 underline" onClick={() => setActive(i)}>{m.pick}</button>}
                    </div>
                    {o && <span className="ltr-nums shrink-0 font-semibold">{money(o.totalSAR)}</span>}
                  </li>
                );
              })}
            </ol>
            <dl className="space-y-1 border-t border-slate-100 pt-3 text-sm">
              <div className="flex justify-between"><dt>{m.payNow}</dt><dd className="ltr-nums font-semibold" data-testid="mc-paynow">{money(payNow)}</dd></div>
              <div className="flex justify-between"><dt>{m.payAtHotels}</dt><dd className="ltr-nums font-semibold" data-testid="mc-athotels">{money(atHotels)}</dd></div>
              <div className="flex justify-between text-base"><dt className="font-bold">{m.total}</dt><dd className="ltr-nums font-bold text-brand-800">{money(payNow + atHotels)}</dd></div>
            </dl>
            {points > 0 && <p className="text-sm font-medium text-gold-700">{fmt(h.earns, { n: points })}</p>}
            <p className="rounded-lg bg-slate-50 p-3 text-xs text-slate-700">{m.allOrNothing}</p>
            {!user ? (
              <Link href={`/${locale}/login?next=/${locale}/hotels`} className="inline-flex h-11 w-full items-center justify-center rounded-lg bg-brand-700 font-semibold text-white hover:bg-brand-800">{h.signIn}</Link>
            ) : !complete ? (
              <p className="text-sm text-amber-800" role="status" data-testid="mc-incomplete">{m.pickAll}</p>
            ) : (
              <>
                <h3 className="font-bold">{h.lead}</h3>
                <LeadFields form={form} />
                {!form.ok && <p className="text-sm text-amber-800" role="status">{s.completeForm}</p>}
                {payNow > 0
                  ? <Checkout amountSAR={payNow} description={`Hotels ${legs.map((l) => l.city).join("-")} ${start}`} disabled={!form.ok} label={m.pay} onPay={book} testId="mc-pay" />
                  : <Button className="w-full" loading={busy} disabled={!form.ok} onClick={() => void book(undefined)} data-testid="mc-confirm">{m.confirm}</Button>}
              </>
            )}
          </Card>
        </div>
      )}
    </div>
  );
}
