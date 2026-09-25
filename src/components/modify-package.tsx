"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { fmt } from "@/i18n";
import { formatExpiryInput, parseExpiry } from "@/lib/card-expiry";
import type { Eligibility, ModificationQuote } from "@/lib/bookings/modify";
import type { StoredBooking, TransportMode } from "@/lib/bookings/types";
import { cityName, SAUDI_CITIES } from "@/lib/data/cities";
import { addDays } from "@/lib/dates";
import type { FlightOffer, HotelOffer } from "@/lib/types";
import { useApp } from "./app-provider";
import { BackLink } from "./back-link";
import { CardIcon, HotelIcon, LockIcon, PlaneIcon } from "./icons";
import { Alert, Badge, Button, Card, cx, Field, Input, SectionTitle, Select, Spinner, Stars } from "./ui";

type Kind = "extend" | "shorten";
type Quote = Omit<ModificationQuote, "next">;
interface Options {
  kind: Kind;
  departureCity: string;
  returnFlights: FlightOffer[];
  hotels: HotelOffer[];
  domesticFlights: FlightOffer[];
  /** Lists empty because the agents could not be reached. */
  unavailable?: ("hotels" | "domesticFlights" | "returnFlights")[];
}

function Choice({ selected, onClick, children }: { selected: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      type="button"
      aria-pressed={selected}
      onClick={onClick}
      className={cx(
        "w-full rounded-xl border bg-white p-4 text-start transition hover:border-brand-500",
        selected ? "border-brand-600 ring-2 ring-brand-600/40" : "border-slate-200",
      )}
    >
      {children}
    </button>
  );
}

/** Service 2 — package update: extend or shorten a purchased package. */
export function ModifyPackage({ id }: { id: string }) {
  const { t, locale, money } = useApp();
  const m = t.modify;
  const router = useRouter();
  const [booking, setBooking] = useState<StoredBooking | null>(null);
  const [el, setEl] = useState<Eligibility | null>(null);
  const [loadError, setLoadError] = useState(false);

  const [kind, setKind] = useState<Kind>("extend");
  const [date, setDate] = useState("");
  const [mode, setMode] = useState<"lastCity" | "newCity">("lastCity");
  const [city, setCity] = useState("");
  const [transport, setTransport] = useState<TransportMode>("flight");

  const [options, setOptions] = useState<Options | null>(null);
  const [loadingOptions, setLoadingOptions] = useState(false);
  const [hotelId, setHotelId] = useState<string | null>(null);
  const [domesticId, setDomesticId] = useState<string | null>(null);
  const [returnId, setReturnId] = useState<string | null>(null);
  const [quote, setQuote] = useState<Quote | null>(null);
  const [card, setCard] = useState({ holder: "", number: "", exp: "", cvc: "" });
  const [submitting, setSubmitting] = useState(false);
  // One key per priced change: resending the same request (double click, network retry) applies it once.
  const idempotencyKey = useMemo(() => (quote ? crypto.randomUUID() : ""), [quote]);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetch(`/api/bookings/${id}`, { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : Promise.reject()))
      .then((d) => {
        setBooking(d.booking);
        setEl(d.modification);
      })
      .catch(() => setLoadError(true));
  }, [id]);

  const bounds = useMemo(() => {
    if (!el) return { min: "", max: "" };
    return kind === "extend"
      ? { min: addDays(el.currentReturnDate, 1), max: el.maxReturnDate }
      : { min: el.minReturnDate, max: addDays(el.currentReturnDate, -1) };
  }, [el, kind]);

  // Any change to the request invalidates the options and the quote.
  useEffect(() => {
    setOptions(null);
    setQuote(null);
    setHotelId(null);
    setDomesticId(null);
    setReturnId(null);
    setError(null);
  }, [kind, date, mode, city, transport]);

  const target = kind === "extend" ? (mode === "lastCity" ? { mode } : { mode, city, transport }) : undefined;
  const errText = (code: string) => (m.errors as Record<string, string>)[code] ?? (t.review.errors as Record<string, string>)[code] ?? t.review.errors.generic;

  async function loadOptions() {
    setLoadingOptions(true);
    setError(null);
    try {
      const res = await fetch(`/api/bookings/${id}/modify/options`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ newReturnDate: date, target }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      setOptions(data);
      const h = data.hotels as HotelOffer[];
      setHotelId(h[0]?.id ?? null);
      setDomesticId((data.domesticFlights as FlightOffer[])[0]?.id ?? null);
      setReturnId((data.returnFlights as FlightOffer[])[0]?.id ?? null);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoadingOptions(false);
    }
  }

  const plan = useMemo(() => {
    if (!options) return null;
    const returnFlight = options.returnFlights.find((f) => f.id === returnId);
    const hotel = options.hotels.find((h) => h.id === hotelId);
    const domesticFlight = options.domesticFlights.find((f) => f.id === domesticId);
    if (!returnFlight) return null;
    if (options.kind === "extend" && !hotel) return null;
    if (options.kind === "extend" && mode === "newCity" && transport === "flight" && !domesticFlight) return null;
    return { newReturnDate: date, target, offers: { returnFlight, hotel: options.kind === "extend" ? hotel : undefined, domesticFlight: options.kind === "extend" && mode === "newCity" && transport === "flight" ? domesticFlight : undefined } };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [options, returnId, hotelId, domesticId]);

  // Price the chosen plan on the server.
  useEffect(() => {
    if (!plan) return;
    let live = true;
    setQuote(null);
    fetch(`/api/bookings/${id}/modify/quote`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(plan) })
      .then(async (res) => {
        const data = await res.json();
        if (!live) return;
        if (res.ok) {
          setQuote(data.quote);
          setError(null);
        } else setError(data.error ?? "generic");
      })
      .catch(() => live && setError("generic"));
    return () => {
      live = false;
    };
  }, [plan, id]);

  async function apply(e: React.FormEvent) {
    e.preventDefault();
    if (!plan || !quote) return;
    setSubmitting(true);
    setError(null);
    const { expMonth, expYear } = parseExpiry(card.exp);
    try {
      const res = await fetch(`/api/bookings/${id}/modify`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          plan,
          expectedChargeSAR: quote.chargeSAR,
          expectedRefundSAR: quote.refundSAR,
          bookingVersion: quote.bookingVersion,
          idempotencyKey,
          card: quote.chargeSAR > 0 ? { holder: card.holder, number: card.number, expMonth, expYear, cvc: card.cvc } : undefined,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "generic");
      router.push(`/${locale}/account/bookings/${id}?updated=1`);
    } catch (err) {
      setError((err as Error).message);
      setSubmitting(false);
    }
  }

  if (loadError) return <Alert tone="error">{t.review.errors.generic}</Alert>;
  if (!booking || !el) return <div className="grid min-h-[40vh] place-items-center text-brand-700"><Spinner className="size-8" /></div>;

  const back = <BackLink href={`/${locale}/account/bookings/${id}`} label={booking.reference} className="-ms-2.5" />;
  if (!el.allowed) {
    return (
      <div className="space-y-4">
        {back}
        <h1 className="text-2xl font-bold">{m.title}</h1>
        <Alert tone="warning">{m.notAllowed[el.reason ?? "tooLate"]}</Alert>
      </div>
    );
  }

  const retFlight = booking.flights.find((f) => f.kind === "return")!;
  const dateOk = !!date && date >= bounds.min && date <= bounds.max;
  const cityOk = kind === "shorten" || mode === "lastCity" || (!!city && city !== el.lastCity);
  const dateFmt = (d: string) => new Date(d).toLocaleString(locale === "ar" ? "ar-SA-u-nu-latn-ca-gregory" : "en-GB", { timeZone: "Asia/Riyadh", dateStyle: "medium", timeStyle: "short" });

  const flightRow = (f: FlightOffer) => (
    <div className="flex flex-wrap items-center justify-between gap-3">
      <div>
        <p className="font-semibold">{cityName(f.from, locale)} {locale === "ar" ? "←" : "→"} {cityName(f.to, locale)}</p>
        <p className="ltr-nums text-xs text-slate-500">{f.flightNo} · {f.departAt.replace("T", " ")} → {f.arriveAt.slice(11)} · {locale === "ar" ? f.carrierNameAr : f.carrierNameEn}</p>
      </div>
      <div className="flex items-center gap-2">
        <Badge tone="gold">{locale === "ar" ? f.agentNameAr : f.agentNameEn}</Badge>
        <span className="ltr-nums font-bold">{money(f.totalSAR)}</span>
      </div>
    </div>
  );

  return (
    <div className="space-y-5">
      {back}
      <div>
        <h1 className="text-2xl font-bold">{m.title}</h1>
        <p className="mt-1 text-sm text-slate-600">{m.subtitle}</p>
      </div>

      <Card className="grid gap-4 p-5 sm:grid-cols-2 lg:grid-cols-4">
        <div><p className="text-xs text-slate-500">{m.returnDate}</p><p className="ltr-nums font-bold">{el.currentReturnDate}</p></div>
        <div><p className="text-xs text-slate-500">{m.lastCity}</p><p className="font-bold">{cityName(el.lastCity, locale)}</p></div>
        <div><p className="text-xs text-slate-500">{m.visaExpiry}</p><p className="ltr-nums font-bold">{el.visaExpiryDate ?? "—"}</p></div>
        <div><p className="text-xs text-slate-500">{m.deadline}</p><p className="ltr-nums font-bold">{dateFmt(el.deadline)}</p></div>
      </Card>

      <Card className="space-y-5 p-5 sm:p-6">
        <div className="grid gap-3 sm:grid-cols-2">
          {(["extend", "shorten"] as const).map((k) => (
            <Choice key={k} selected={kind === k} onClick={() => { setKind(k); setDate(""); }}>
              <p className="font-bold">{m[k]}</p>
              <p className="mt-1 text-xs text-slate-500">{k === "extend" ? m.extendDesc : m.shortenDesc}</p>
            </Choice>
          ))}
        </div>

        <Field label={m.newReturnDate} required hint={fmt(m.dateRange, { min: bounds.min, max: bounds.max })} htmlFor="new-return" className="max-w-xs">
          <Input id="new-return" type="date" value={date} min={bounds.min} max={bounds.max} onChange={(e) => setDate(e.target.value)} />
        </Field>

        {kind === "extend" && (
          <fieldset className="space-y-3">
            <legend className="text-sm font-semibold text-slate-700">{m.where}</legend>
            <div className="grid gap-3 sm:grid-cols-2">
              <Choice selected={mode === "lastCity"} onClick={() => setMode("lastCity")}>
                <p className="font-semibold">{fmt(m.lastCityOption, { city: cityName(el.lastCity, locale) })}</p>
              </Choice>
              <Choice selected={mode === "newCity"} onClick={() => setMode("newCity")}>
                <p className="font-semibold">{m.newCityOption}</p>
              </Choice>
            </div>
            {mode === "newCity" && (
              <div className="grid gap-4 sm:grid-cols-2">
                <Field label={m.newCity} required htmlFor="new-city">
                  <Select id="new-city" value={city} onChange={(e) => setCity(e.target.value)}>
                    <option value="">{m.chooseCity}</option>
                    {SAUDI_CITIES.filter((c) => c.code !== el.lastCity).map((c) => <option key={c.code} value={c.code}>{c[locale]}</option>)}
                  </Select>
                </Field>
                <Field label={m.transport} required htmlFor="transport" hint={transport !== "flight" ? m.selfArranged : undefined}>
                  <Select id="transport" value={transport} onChange={(e) => setTransport(e.target.value as TransportMode)}>
                    {(["flight", "car", "train"] as const).map((x) => <option key={x} value={x}>{m.transports[x]}</option>)}
                  </Select>
                </Field>
              </div>
            )}
          </fieldset>
        )}

        <Button onClick={() => void loadOptions()} disabled={!dateOk || !cityOk} loading={loadingOptions}>{m.showOptions}</Button>
      </Card>

      {error && <Alert tone="error">{errText(error)}</Alert>}

      {options && (
        <div className="space-y-5">
          {options.kind === "extend" && (
            <Card className="p-5 sm:p-6">
              <SectionTitle title={m.hotelsTitle} icon={<HotelIcon className="size-5" />} />
              {options.hotels.length === 0 && <Alert tone="warning" className="mt-3">{options.unavailable?.includes("hotels") ? m.agentsUnavailable : m.noOptions}</Alert>}
              <div className="mt-4 grid gap-3 md:grid-cols-2">
                {options.hotels.slice(0, 10).map((h) => (
                  <Choice key={h.id} selected={hotelId === h.id} onClick={() => setHotelId(h.id)}>
                    {h.id.startsWith("HX:") && <Badge tone="brand" className="mb-2">{m.sameHotel}</Badge>}
                    <p className="flex items-center gap-2 font-semibold">{locale === "ar" ? h.nameAr : h.nameEn} <Stars n={h.stars} /></p>
                    <p className="ltr-nums text-xs text-slate-500">{cityName(h.city, locale)} · {h.checkIn} → {h.checkOut} · {h.nights} {t.common.nights}</p>
                    <div className="mt-2 flex items-center justify-between gap-2">
                      <Badge tone="gold">{locale === "ar" ? h.agentNameAr : h.agentNameEn}</Badge>
                      <span className="ltr-nums font-bold">{money(h.totalSAR)}</span>
                    </div>
                    <p className="mt-1 text-[11px] text-slate-500">{h.refundable ? t.common.refundable : t.common.nonRefundable}</p>
                  </Choice>
                ))}
              </div>
            </Card>
          )}

          {options.kind === "extend" && mode === "newCity" && transport === "flight" && (
            <Card className="p-5 sm:p-6">
              <SectionTitle title={m.domesticTitle} icon={<PlaneIcon className="size-5" />} />
              {options.domesticFlights.length === 0 && <Alert tone="warning" className="mt-3">{options.unavailable?.includes("domesticFlights") ? m.agentsUnavailable : m.noOptions}</Alert>}
              <div className="mt-4 space-y-2">
                {options.domesticFlights.slice(0, 8).map((f) => (
                  <Choice key={f.id} selected={domesticId === f.id} onClick={() => setDomesticId(f.id)}>{flightRow(f)}</Choice>
                ))}
              </div>
            </Card>
          )}

          <Card className="p-5 sm:p-6">
            <SectionTitle title={m.returnTitle} icon={<PlaneIcon className="size-5" />} subtitle={fmt(m.returnAgentNote, { agent: locale === "ar" ? retFlight.agentNameAr : retFlight.agentNameEn })} />
            {options.returnFlights.length === 0 && <Alert tone="warning" className="mt-3">{options.unavailable?.includes("returnFlights") ? m.agentsUnavailable : m.noOptions}</Alert>}
            <div className="mt-4 space-y-2">
              {options.returnFlights.slice(0, 8).map((f) => (
                <Choice key={f.id} selected={returnId === f.id} onClick={() => setReturnId(f.id)}>{flightRow(f)}</Choice>
              ))}
            </div>
          </Card>

          {!plan && (
            <Alert tone="warning">
              {fmt(m.cannotComplete, {
                items: [
                  options.kind === "extend" && !options.hotels.length && m.hotelsTitle,
                  options.kind === "extend" && mode === "newCity" && transport === "flight" && !options.domesticFlights.length && m.domesticTitle,
                  !options.returnFlights.length && m.returnTitle,
                ].filter(Boolean).join(locale === "ar" ? "، " : ", ") || m.selectAll,
              })}
            </Alert>
          )}
          {plan && !quote && !error && <div className="flex items-center gap-3 text-brand-700"><Spinner className="size-5" />{t.common.loading}</div>}

          {quote && (
            <form onSubmit={apply}>
              <Card className="p-5 sm:p-6">
                <SectionTitle title={m.summary} icon={<CardIcon className="size-5" />} subtitle={fmt(m.newDuration, { n: quote.newDurationDays })} />
                <ul className="mt-4 divide-y divide-slate-100 text-sm">
                  {quote.lines.map((l, i) => {
                    const fee = l.detail?.startsWith("fee:") ? Number(l.detail.slice(4)) : 0;
                    return (
                      <li key={i} className="flex flex-wrap items-start justify-between gap-2 py-2.5">
                        <div className="min-w-0">
                          <p className="font-semibold">{m.lineTypes[l.type]}</p>
                          <p className="text-xs text-slate-500">
                            {locale === "ar" ? l.labelAr : l.labelEn}
                            {l.agentNameEn && <span className="text-gold-700"> · {locale === "ar" ? l.agentNameAr : l.agentNameEn}</span>}
                          </p>
                          {fee > 0 && <p className="text-xs text-slate-500">{fmt(m.changeFee, { amount: money(fee) })}</p>}
                          {l.nonRefundableSAR > 0 && <p className="text-xs font-medium text-red-700">{fmt(m.nonRefundable, { amount: money(l.nonRefundableSAR) })}</p>}
                        </div>
                        <span className={cx("ltr-nums font-bold", l.amountSAR < 0 && "text-brand-700")}>{l.amountSAR ? money(l.amountSAR) : "—"}</span>
                      </li>
                    );
                  })}
                </ul>
                <div className="mt-4 space-y-1.5 rounded-lg bg-slate-50 p-4 text-sm">
                  <p className="flex justify-between"><span>{m.newTotal}</span><span className="ltr-nums font-semibold">{money(quote.newTotalSAR)}</span></p>
                  {quote.chargeSAR > 0 && <p className="flex justify-between text-base font-bold"><span>{m.toPay}</span><span className="ltr-nums">{money(quote.chargeSAR)}</span></p>}
                  {quote.refundSAR > 0 && <p className="flex justify-between text-base font-bold text-brand-700"><span>{m.toRefund}</span><span className="ltr-nums">{money(quote.refundSAR)}</span></p>}
                  {quote.chargeSAR === 0 && quote.refundSAR === 0 && <p className="font-semibold">{m.nothingToPay}</p>}
                </div>
                {quote.refundSAR > 0 && <p className="mt-2 text-xs text-slate-500">{m.refundNote}</p>}

                {quote.chargeSAR > 0 && (
                  <div className="mt-5 grid gap-4 sm:grid-cols-2">
                    <Field label={t.review.cardHolder} required className="sm:col-span-2">
                      <Input dir="ltr" autoComplete="cc-name" value={card.holder} onChange={(e) => setCard({ ...card, holder: e.target.value })} required />
                    </Field>
                    <Field label={t.review.cardNumber} required className="sm:col-span-2">
                      <Input dir="ltr" inputMode="numeric" autoComplete="cc-number" placeholder="0000 0000 0000 0000" value={card.number}
                        onChange={(e) => setCard({ ...card, number: e.target.value.replace(/[^\d ]/g, "").slice(0, 23) })} required />
                    </Field>
                    <Field label={t.review.expiry} required>
                      <Input dir="ltr" inputMode="numeric" autoComplete="cc-exp" placeholder="MM/YY" value={card.exp}
                        onChange={(e) => setCard({ ...card, exp: formatExpiryInput(e.target.value).slice(0, 7) })} required />
                    </Field>
                    <Field label={t.review.cvc} required>
                      <Input dir="ltr" inputMode="numeric" autoComplete="cc-csc" type="password" value={card.cvc}
                        onChange={(e) => setCard({ ...card, cvc: e.target.value.replace(/\D/g, "").slice(0, 4) })} required />
                    </Field>
                  </div>
                )}
                <Button type="submit" size="lg" variant="gold" className="mt-5 w-full" loading={submitting}>
                  <LockIcon className="size-5" />
                  {submitting ? m.applying : quote.chargeSAR > 0 ? fmt(m.confirmPay, { amount: money(quote.chargeSAR) }) : m.confirm}
                </Button>
              </Card>
            </form>
          )}
        </div>
      )}

      <Link href={`/${locale}/account/bookings/${id}`} className="inline-flex h-11 items-center rounded-lg px-5 text-sm font-semibold text-brand-800 ring-1 ring-brand-700/25">{t.common.back}</Link>
    </div>
  );
}
