"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { fmt } from "@/i18n";
import { formatExpiryInput, parseExpiry } from "@/lib/card-expiry";
import { addDaysISO, fmtKsa, ksaDay } from "@/lib/events/format";
import type { Line, Station } from "@/lib/trains/network";
import type { TrainClass, TrainTrip } from "@/lib/trains/sar";
import { useApp } from "../app-provider";
import { CountrySelect } from "../booking/country-select";
import { LockIcon, TrainIcon } from "../icons";
import { Alert, Badge, Button, Card, cx, Field, Input, Select, Spinner } from "../ui";

type Trip = TrainTrip & { seatsLeft: Record<TrainClass, number> };
interface PassengerOption { ref: string; nameEn: string; nationality: string; passportMasked: string; birthDate: string | null }
interface PassengerForm { type: "adult" | "child"; ref: string; nameEn: string; nationality: string; passportNo: string }

const COACHES = [
  { id: "C1", cls: "business" as const, rows: 10, letters: ["A", "B", "C"], aisleAfter: 1 },
  { id: "C2", cls: "economy" as const, rows: 15, letters: ["A", "B", "C", "D"], aisleAfter: 2 },
  { id: "C3", cls: "economy" as const, rows: 15, letters: ["A", "B", "C", "D"], aisleAfter: 2 },
  { id: "C4", cls: "economy" as const, rows: 15, letters: ["A", "B", "C", "D"], aisleAfter: 2 },
];
const newKey = () => (typeof crypto !== "undefined" && "randomUUID" in crypto ? crypto.randomUUID() : `${Date.now()}-${Math.random()}`);

/** Train tickets (SAR): search, trips, seats on the coach map, passengers and payment. */
export function TrainsView() {
  const { t, locale, money, user, currency } = useApp();
  const tr = t.trains;
  const ar = locale === "ar";
  const router = useRouter();
  const today = ksaDay(new Date());

  const [net, setNet] = useState<{ stations: Station[]; lines: Line[] } | null>(null);
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [date, setDate] = useState(addDaysISO(today, 1));
  const [round, setRound] = useState(false);
  const [retDate, setRetDate] = useState(addDaysISO(today, 3));
  const [adults, setAdults] = useState(1);
  const [children, setChildren] = useState(0);
  const [cls, setCls] = useState<TrainClass>("economy");
  const [searching, setSearching] = useState(false);
  const [results, setResults] = useState<{ out: Trip[]; ret: Trip[] | null } | null>(null);
  const [outTrip, setOutTrip] = useState<Trip | null>(null);
  const [retTrip, setRetTrip] = useState<Trip | null>(null);
  const [seats, setSeats] = useState<[string[], string[]]>([[], []]);
  const [taken, setTaken] = useState<[string[] | null, string[] | null]>([null, null]);
  const [options, setOptions] = useState<PassengerOption[]>([]);
  const [pax, setPax] = useState<PassengerForm[]>([]);
  const [card, setCard] = useState({ holder: "", number: "", exp: "", cvc: "" });
  const [paying, setPaying] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const key = useRef(newKey());
  const count = adults + children;

  useEffect(() => {
    fetch("/api/trains/stations")
      .then((r) => r.json())
      .then((d) => {
        setNet(d);
        const f = new URLSearchParams(window.location.search).get("from")?.toUpperCase();
        if (f && d.stations.some((s: Station) => s.code === f)) setFrom(f);
      });
  }, []);

  useEffect(() => {
    if (!user) return;
    fetch("/api/trains/passengers", { cache: "no-store" }).then((r) => (r.ok ? r.json() : { passengers: [] })).then((d) => setOptions(d.passengers));
  }, [user]);

  // One passenger form per traveller (adults first).
  useEffect(() => {
    setPax((cur) => Array.from({ length: count }, (_, i) => {
      const type = i < adults ? "adult" : "child";
      const prev = cur[i];
      return prev && prev.type === type ? prev : { type, ref: "", nameEn: "", nationality: "", passportNo: "" };
    }));
  }, [adults, children, count]);

  const station = useCallback((code: string) => net?.stations.find((s) => s.code === code) ?? null, [net]);
  const stName = (code: string) => {
    const s = station(code);
    return s ? (ar ? s.nameAr : s.nameEn) : code;
  };
  const destinations = useMemo(() => {
    const s = station(from);
    return s ? net!.stations.filter((x) => x.line === s.line && x.code !== s.code) : [];
  }, [from, net, station]);

  const legs = [outTrip, round ? retTrip : null].filter(Boolean) as Trip[];
  const resetBooking = () => {
    setErr(null);
    key.current = newKey();
  };

  async function search(e: React.FormEvent) {
    e.preventDefault();
    if (!from || !to) return;
    setSearching(true);
    setOutTrip(null);
    setRetTrip(null);
    setSeats([[], []]);
    setTaken([null, null]);
    resetBooking();
    try {
      const get = async (a: string, b: string, d: string) => ((await (await fetch(`/api/trains/search?from=${a}&to=${b}&date=${d}`, { cache: "no-store" })).json()).trips ?? []) as Trip[];
      const [out, ret] = await Promise.all([get(from, to, date), round ? get(to, from, retDate) : Promise.resolve(null)]);
      setResults({ out, ret });
    } finally {
      setSearching(false);
    }
  }

  const loadTaken = useCallback(async (leg: 0 | 1, trip: Trip | null) => {
    if (!trip) return null;
    setTaken((cur) => (leg === 0 ? [null, cur[1]] : [cur[0], null]));
    const r = await fetch(`/api/trains/seats?trip=${encodeURIComponent(trip.id)}&cls=${cls}`, { cache: "no-store" });
    const list: string[] = r.ok ? (await r.json()).unavailable : [];
    setTaken((cur) => (leg === 0 ? [list, cur[1]] : [cur[0], list]));
    return list;
  }, [cls]);

  useEffect(() => {
    setSeats((cur) => [cur[0].slice(0, count), cur[1].slice(0, count)]);
  }, [count]);
  useEffect(() => {
    setSeats((cur) => [[], cur[1]]);
    void loadTaken(0, outTrip);
  }, [outTrip, loadTaken]);
  useEffect(() => {
    setSeats((cur) => [cur[0], []]);
    void loadTaken(1, retTrip);
  }, [retTrip, loadTaken]);

  const price = legs.reduce((a, l) => a + adults * l.fares[cls].adult + children * l.fares[cls].child, 0);
  const total = Math.round(price * 100) / 100;
  const seatsReady = legs.length > 0 && legs.every((_, i) => seats[i].length === count);
  const paxReady = pax.every((p) => p.ref || (p.nameEn.trim().includes(" ") && p.nationality && p.passportNo.trim().length >= 5));
  const ready = legs.length === (round ? 2 : 1) && seatsReady && paxReady;

  async function pay(e: React.FormEvent) {
    e.preventDefault();
    if (!ready) return;
    setPaying(true);
    setErr(null);
    try {
      const { expMonth, expYear } = parseExpiry(card.exp);
      const res = await fetch("/api/trains/orders", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          legs: legs.map((l, i) => ({ tripId: l.id, cls, seats: seats[i] })),
          passengers: pax.map((p) => (p.ref ? { type: p.type, ref: p.ref } : { type: p.type, nameEn: p.nameEn, nationality: p.nationality, passportNo: p.passportNo })),
          expectedTotalSAR: total, idempotencyKey: key.current, displayCurrency: currency,
          card: { holder: card.holder, number: card.number.replace(/\s/g, ""), expMonth, expYear, cvc: card.cvc },
        }),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) {
        setErr((tr.errors as Record<string, string>)[body.error] ?? tr.errors.generic);
        key.current = newKey();
        if (body.error === "seatUnavailable") {
          const [a, b] = await Promise.all([loadTaken(0, outTrip), loadTaken(1, round ? retTrip : null)]);
          setSeats((cur) => [cur[0].filter((s) => !a?.includes(s)), cur[1].filter((s) => !b?.includes(s))]);
        }
        return;
      }
      router.push(`/${locale}/account/train-tickets/${body.order.id}?new=1`);
    } finally {
      setPaying(false);
    }
  }

  if (!net) return <div className="grid min-h-[40vh] place-items-center text-brand-700"><Spinner className="size-8" /></div>;
  const makkah = from === "MKK" || to === "MKK";

  const tripList = (list: Trip[], selected: Trip | null, onPick: (t: Trip) => void, testid: string) =>
    list.length === 0 ? <p className="py-4 text-sm text-slate-500">{tr.noTrips}</p> : (
      <ul className="mt-3 space-y-2" data-testid={testid}>
        {list.map((trip) => {
          const line = net.lines.find((l) => l.id === trip.lineId)!;
          const left = trip.seatsLeft[cls];
          const nextDay = ksaDay(trip.arrive) !== ksaDay(trip.depart);
          const isSel = selected?.id === trip.id;
          return (
            <li key={trip.id} className={cx("flex flex-wrap items-center gap-4 rounded-xl border p-3 transition", isSel ? "border-brand-700 bg-brand-50" : "border-slate-200")}>
              <span className="h-10 w-1.5 rounded-full" style={{ background: line.color }} />
              <div className="min-w-0 flex-1">
                <p className="ltr-nums text-lg font-bold">
                  {fmtKsa(trip.depart, locale, { hour: "2-digit", minute: "2-digit" })} → {fmtKsa(trip.arrive, locale, { hour: "2-digit", minute: "2-digit" })}
                  {nextDay && <sup className="ms-1 text-xs text-amber-700">+1</sup>}
                </p>
                <p className="text-xs text-slate-500">
                  {fmt(tr.duration, { h: Math.floor(trip.durationMins / 60), m: trip.durationMins % 60 })} · {fmt(tr.train, { no: trip.trainNo })} · {ar ? line.nameAr : line.nameEn}
                </p>
              </div>
              <div className="text-end">
                <p className="font-bold text-brand-800">{money(trip.fares[cls].adult)}</p>
                <p className="text-[11px] text-slate-500">{tr.perAdult} · {left >= count ? fmt(tr.seatsLeft, { n: left }) : tr.soldOut}</p>
              </div>
              <Button size="sm" variant={isSel ? "primary" : "secondary"} disabled={left < count} onClick={() => { resetBooking(); onPick(trip); }}>
                {isSel ? tr.selected : tr.select}
              </Button>
            </li>
          );
        })}
      </ul>
    );

  return (
    <div className="space-y-6">
      <div>
        <h1 className="flex items-center gap-2 text-2xl font-bold sm:text-3xl"><TrainIcon className="size-7 text-brand-700" />{tr.title}</h1>
        <p className="mt-1 max-w-3xl text-sm text-slate-600">{tr.subtitle}</p>
      </div>

      <Card className="p-5">
        <form onSubmit={search} className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
          <Field label={tr.from} required>
            <Select value={from} onChange={(e) => { setFrom(e.target.value); setTo(""); setResults(null); }} required>
              <option value="">{tr.chooseStation}</option>
              {net.lines.map((l) => (
                <optgroup key={l.id} label={ar ? l.nameAr : l.nameEn}>
                  {net.stations.filter((s) => s.line === l.id).map((s) => <option key={s.code} value={s.code}>{ar ? s.nameAr : s.nameEn}</option>)}
                </optgroup>
              ))}
            </Select>
          </Field>
          <Field label={tr.to} required>
            <Select value={to} onChange={(e) => { setTo(e.target.value); setResults(null); }} disabled={!from} required>
              <option value="">{tr.chooseStation}</option>
              {destinations.map((s) => <option key={s.code} value={s.code}>{ar ? s.nameAr : s.nameEn}</option>)}
            </Select>
          </Field>
          <Field label={tr.date} required>
            <Input type="date" dir="ltr" min={today} max={addDaysISO(today, 90)} value={date} onChange={(e) => { setDate(e.target.value); if (retDate < e.target.value) setRetDate(e.target.value); }} required />
          </Field>
          <div className="flex flex-col gap-1.5">
            <label className="flex items-center gap-2 text-sm font-medium text-slate-700">
              <input type="checkbox" checked={round} onChange={(e) => { setRound(e.target.checked); setResults(null); }} className="size-4 accent-brand-700" />{tr.roundTrip}
            </label>
            {round && <Input type="date" dir="ltr" aria-label={tr.returnDate} min={date} max={addDaysISO(today, 90)} value={retDate} onChange={(e) => setRetDate(e.target.value)} required />}
          </div>
          <Counter label={tr.adults} value={adults} min={1} max={9 - children} onChange={setAdults} />
          <Counter label={tr.children} value={children} min={0} max={9 - adults} onChange={setChildren} />
          <Field label={tr.cls}>
            <Select value={cls} onChange={(e) => { setCls(e.target.value as TrainClass); resetBooking(); }}>
              <option value="economy">{tr.classes.economy}</option>
              <option value="business">{tr.classes.business}</option>
            </Select>
          </Field>
          <div className="flex items-end">
            <Button type="submit" className="w-full" loading={searching} disabled={!from || !to}>{tr.search}</Button>
          </div>
        </form>
        {makkah && <Alert tone="warning" className="mt-4">{tr.makkahNote}</Alert>}
      </Card>

      {results && (
        <div className="grid gap-6 lg:grid-cols-[1fr_360px]">
          <div className="min-w-0 space-y-6">
            <Card className="p-5">
              <h2 className="font-bold">{tr.outbound}: {stName(from)} → {stName(to)}</h2>
              {tripList(results.out, outTrip, setOutTrip, "trips-out")}
            </Card>
            {results.ret && (
              <Card className="p-5">
                <h2 className="font-bold">{tr.return}: {stName(to)} → {stName(from)}</h2>
                {tripList(results.ret.filter((r) => !outTrip || Date.parse(r.depart) > Date.parse(outTrip.arrive)), retTrip, setRetTrip, "trips-ret")}
              </Card>
            )}

            {legs.map((leg, i) => (
              <Card key={leg.id} className="p-5">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <h2 className="font-bold">{fmt(tr.seatsTitle, { leg: i === 0 ? tr.outbound : tr.return })}</h2>
                  <span className="text-xs text-slate-500">{fmt(tr.seatsHint, { n: count })} · {seats[i].length}/{count}</span>
                </div>
                {taken[i] === null ? <p className="flex items-center gap-2 py-6 text-sm text-slate-500"><Spinner className="size-4" /></p> : (
                  <CoachMap
                    cls={cls}
                    taken={taken[i]!}
                    selected={seats[i]}
                    max={count}
                    onChange={(list) => { setErr(null); key.current = newKey(); setSeats((cur) => (i === 0 ? [list, cur[1]] : [cur[0], list])); }}
                    testid={`coach-${i}`}
                  />
                )}
              </Card>
            ))}

            {legs.length > 0 && (
              <Card className="p-5">
                <h2 className="font-bold">{tr.passengers}</h2>
                <p className="mt-1 text-xs text-slate-500">{tr.passengersNote}</p>
                {!user ? <p className="mt-3 text-sm text-slate-600">{tr.loginToBuy}</p> : (
                  <div className="mt-4 space-y-4">
                    {pax.map((p, i) => {
                      const used = new Set(pax.filter((_, j) => j !== i).map((x) => x.ref).filter(Boolean));
                      const set = (patch: Partial<PassengerForm>) => setPax((cur) => cur.map((x, j) => (j === i ? { ...x, ...patch } : x)));
                      return (
                        <div key={i} className="rounded-xl border border-slate-200 p-4" data-testid="passenger">
                          <p className="text-sm font-bold">{fmt(tr.passengerN, { n: i + 1 })} <Badge>{tr.types[p.type]}</Badge></p>
                          <div className="mt-3 grid gap-3 sm:grid-cols-2">
                            <Field label={tr.pickSaved} className="sm:col-span-2">
                              <Select value={p.ref} onChange={(e) => set({ ref: e.target.value })}>
                                <option value="">{tr.manualEntry}</option>
                                {options.map((o) => <option key={o.ref} value={o.ref} disabled={used.has(o.ref)}>{o.nameEn} · {o.nationality} · {o.passportMasked}</option>)}
                              </Select>
                            </Field>
                            {!p.ref && (
                              <>
                                <Field label={tr.nameEn} required className="sm:col-span-2">
                                  <Input dir="ltr" value={p.nameEn} onChange={(e) => set({ nameEn: e.target.value.toUpperCase().replace(/[^A-Z' -]/g, "") })} placeholder="SARA ALI" />
                                </Field>
                                <Field label={tr.nationality} required>
                                  <CountrySelect value={p.nationality} onChange={(v) => set({ nationality: v })} />
                                </Field>
                                <Field label={tr.passportNo} required>
                                  <Input dir="ltr" value={p.passportNo} onChange={(e) => set({ passportNo: e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 15) })} />
                                </Field>
                              </>
                            )}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </Card>
            )}
          </div>

          <div className="lg:sticky lg:top-24 lg:self-start">
            <Card className="p-5">
              <h2 className="font-bold">{tr.summary}</h2>
              {legs.length === 0 ? <p className="mt-3 text-sm text-slate-500">—</p> : (
                <ul className="mt-3 space-y-3 text-sm">
                  {legs.map((l, i) => (
                    <li key={l.id}>
                      <p className="font-semibold">{i === 0 ? tr.outbound : tr.return}: {stName(l.from)} → {stName(l.to)}</p>
                      <p className="text-xs text-slate-500">{fmtKsa(l.depart, locale, { weekday: "short", day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })} · {tr.classes[cls]} · {seats[i].join(", ") || "—"}</p>
                      <p className="text-xs text-slate-600">
                        {adults} × {money(l.fares[cls].adult)}{children > 0 && ` + ${children} × ${money(l.fares[cls].child)}`}
                      </p>
                    </li>
                  ))}
                </ul>
              )}
              <div className="mt-3 flex justify-between border-t border-slate-100 pt-3 font-bold">
                <span>{tr.total}</span><span className="text-brand-800" data-testid="train-total">{money(total)}</span>
              </div>
              {currency !== "SAR" && <p className="mt-1 text-xs text-slate-500">{t.review.chargedInSAR}</p>}
              <p className="mt-3 text-xs text-slate-500">{tr.policy}</p>
              {err && <Alert tone="error" className="mt-3">{err}</Alert>}
              {!user ? (
                <Link href={`/${locale}/login?next=${encodeURIComponent(`/${locale}/trains`)}`} className="mt-4 inline-flex h-11 w-full items-center justify-center rounded-lg bg-brand-700 text-sm font-semibold text-white hover:bg-brand-800">{tr.login}</Link>
              ) : (
                <form onSubmit={pay} className="mt-4 space-y-3">
                  <Field label={t.review.cardHolder} required><Input dir="ltr" autoComplete="cc-name" value={card.holder} onChange={(e) => setCard({ ...card, holder: e.target.value })} required /></Field>
                  <Field label={t.review.cardNumber} required>
                    <Input dir="ltr" inputMode="numeric" autoComplete="cc-number" placeholder="0000 0000 0000 0000" value={card.number} onChange={(e) => setCard({ ...card, number: e.target.value.replace(/[^\d ]/g, "").slice(0, 23) })} required />
                  </Field>
                  <div className="grid grid-cols-2 gap-3">
                    <Field label={t.review.expiry} required><Input dir="ltr" inputMode="numeric" autoComplete="cc-exp" placeholder="MM/YY" value={card.exp} onChange={(e) => setCard({ ...card, exp: formatExpiryInput(e.target.value).slice(0, 7) })} required /></Field>
                    <Field label={t.review.cvc} required><Input dir="ltr" inputMode="numeric" autoComplete="cc-csc" type="password" value={card.cvc} onChange={(e) => setCard({ ...card, cvc: e.target.value.replace(/\D/g, "").slice(0, 4) })} required /></Field>
                  </div>
                  <p className="text-xs text-slate-500">{t.review.testCards}</p>
                  <Button type="submit" variant="gold" size="lg" className="w-full" loading={paying} disabled={!ready}>
                    <LockIcon className="size-5" />{paying ? tr.paying : fmt(tr.pay, { amount: money(total) })}
                  </Button>
                </form>
              )}
            </Card>
          </div>
        </div>
      )}
    </div>
  );
}

function Counter({ label, value, min, max, onChange }: { label: string; value: number; min: number; max: number; onChange: (n: number) => void }) {
  return (
    <div className="flex flex-col gap-1.5">
      <span className="text-sm font-medium text-slate-700">{label}</span>
      <div className="flex h-11 items-center justify-between rounded-lg border border-slate-300 px-2">
        <button type="button" aria-label={`${label} −`} onClick={() => onChange(Math.max(min, value - 1))} disabled={value <= min} className="grid size-8 place-items-center rounded-full text-lg font-bold disabled:opacity-30">−</button>
        <span className="font-bold" aria-live="polite">{value}</span>
        <button type="button" aria-label={`${label} +`} onClick={() => onChange(Math.min(max, value + 1))} disabled={value >= max} className="grid size-8 place-items-center rounded-full text-lg font-bold text-brand-800 disabled:opacity-30">+</button>
      </div>
    </div>
  );
}

/** Coach seat map: rows left to right, seat letters top to bottom with the aisle. */
function CoachMap({ cls, taken, selected, max, onChange, testid }: {
  cls: TrainClass; taken: string[]; selected: string[]; max: number; onChange: (seats: string[]) => void; testid: string;
}) {
  const { t } = useApp();
  const tr = t.trains;
  const coaches = COACHES.filter((c) => c.cls === cls);
  const [coachId, setCoachId] = useState(coaches[0].id);
  const coach = coaches.find((c) => c.id === coachId) ?? coaches[0];
  const takenSet = useMemo(() => new Set(taken), [taken]);

  const toggle = (seat: string) => onChange(selected.includes(seat) ? selected.filter((s) => s !== seat) : selected.length >= max ? selected : [...selected, seat]);
  const auto = () => {
    const free = coaches.flatMap((c) => Array.from({ length: c.rows }, (_, r) => c.letters.map((l) => `${c.id}-${r + 1}${l}`)).flat()).filter((s) => !takenSet.has(s));
    onChange(free.slice(0, max));
  };

  return (
    <div className="mt-4 space-y-3" data-testid={testid}>
      <div className="flex flex-wrap items-center gap-2">
        {coaches.map((c) => (
          <button key={c.id} type="button" onClick={() => setCoachId(c.id)} aria-pressed={c.id === coach.id}
            className={cx("h-8 rounded-full border px-3 text-xs font-semibold", c.id === coach.id ? "border-brand-700 bg-brand-700 text-white" : "border-slate-300")}>
            {fmt(tr.coach, { n: c.id.slice(1) })}
          </button>
        ))}
        <Button size="sm" variant="ghost" onClick={auto}>{tr.autoSeats}</Button>
        <span className="ms-auto flex gap-3 text-[11px] text-slate-600">
          <span className="inline-flex items-center gap-1"><span className="size-3.5 rounded border-2 border-brand-600" />{tr.legend.available}</span>
          <span className="inline-flex items-center gap-1"><span className="size-3.5 rounded bg-gold-500" />{tr.legend.selected}</span>
          <span className="inline-flex items-center gap-1"><span className="size-3.5 rounded bg-slate-300" />{tr.legend.unavailable}</span>
        </span>
      </div>
      <div className="overflow-x-auto rounded-xl bg-slate-50 p-3" dir="ltr">
        <div className="w-max rounded-[1.25rem] border-2 border-slate-300 bg-white px-3 py-2">
          {coach.letters.map((letter, li) => (
            <div key={letter}>
              {li === coach.aisleAfter && <div className="h-4" />}
              <div className="flex items-center gap-1 py-0.5">
                <span className="w-4 text-center text-[10px] font-bold text-slate-400">{letter}</span>
                {Array.from({ length: coach.rows }, (_, r) => {
                  const id = `${coach.id}-${r + 1}${letter}`;
                  const isTaken = takenSet.has(id);
                  const isSel = selected.includes(id);
                  return (
                    <button key={id} type="button" data-seat={id} disabled={isTaken || (!isSel && selected.length >= max)} onClick={() => toggle(id)} aria-pressed={isSel} aria-label={id}
                      className={cx("grid size-7 place-items-center rounded-md text-[9px] font-bold",
                        isTaken ? "cursor-not-allowed bg-slate-300 text-slate-400" : isSel ? "bg-gold-500 text-white" : "border-2 border-brand-600 text-slate-500 hover:bg-brand-50 disabled:opacity-40")}>
                      {r + 1}
                    </button>
                  );
                })}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
