"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { fmt } from "@/i18n";
import { SAUDI_CITIES } from "@/lib/data/cities";
import { COUNTRIES } from "@/lib/data/countries";
import type { LicenceRule } from "@/lib/rentals/licence";
import type { CompanyBrand } from "@/lib/rentals/rentals";
import { CAR_CLASSES, DRIVING_TIPS, RENTAL_EXTRAS, type CarClass, type PublicRental, type RentalExtra, type RentalQuery, type RentalQuote, type RentalSpot } from "@/lib/rentals/types";
import { AIRPORTS } from "@/lib/transport/rides";
import { useApp } from "../app-provider";
import { CarIcon, CheckIcon, GlobeIcon } from "../icons";
import { Alert, Badge, Button, Card, cx, Field, Input, Select, Spinner } from "../ui";
import { CompanyBadge } from "./company-badge";

interface Options { query: RentalQuery; quotes: RentalQuote[]; companies: CompanyBrand[]; licence: LicenceRule | null; reviewed: boolean; sourceUrl: string }

const pad = (n: number) => String(n).padStart(2, "0");
/** Saudi local time `days` from now at `h`:00. */
const ksaAt = (days: number, h: number) => {
  const d = new Date(Date.now() + 3 * 3_600_000 + days * 86_400_000);
  return `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}T${pad(h)}:00`;
};

/** The requirements for the driver's licence, from the operations team's rules. */
export function LicenceBox({ licence, reviewed, sourceUrl }: { licence: LicenceRule | null; reviewed: boolean; sourceUrl: string }) {
  const { t, locale } = useApp();
  const r = t.rentals;
  if (!licence) return null;
  const ar = locale === "ar";
  return (
    <div className="rounded-xl bg-amber-50 p-4 text-sm text-amber-900 ring-1 ring-amber-200" data-testid="rental-licence">
      <p className="font-bold">{fmt(r.licenceTitle, { title: ar ? licence.titleAr : licence.titleEn })}</p>
      <ul className="mt-2 space-y-1">
        {(ar ? licence.requirementsAr : licence.requirementsEn).map((x, i) => <li key={i} className="flex gap-2"><CheckIcon className="mt-0.5 size-4 shrink-0" />{x}</li>)}
      </ul>
      <p className="mt-2 flex flex-wrap items-center gap-2 text-xs">
        {!reviewed && <span>{r.licenceUnreviewed}</span>}
        <a href={sourceUrl} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 font-semibold underline"><GlobeIcon className="size-3.5" />{r.licenceSource}</a>
      </p>
    </div>
  );
}

export function DrivingTips() {
  const { t, locale } = useApp();
  return (
    <Card className="p-5" data-testid="driving-tips">
      <h3 className="font-bold">{t.rentals.tipsTitle}</h3>
      <ul className="mt-3 space-y-2 text-sm text-slate-700">
        {DRIVING_TIPS[locale].map((x, i) => <li key={i} className="flex gap-2"><span className="mt-2 size-1.5 shrink-0 rounded-full bg-gold-500" />{x}</li>)}
      </ul>
    </Card>
  );
}

/** Search the rental companies' cars, choose extras, confirm the licence, then book. */
export function RentalSearch({ initial, bookingId, driverName: initialDriver, onDone, onCancel, compact }: {
  initial?: Partial<RentalQuery>; bookingId?: string; driverName?: string; onDone?: (r: PublicRental) => void; onCancel?: () => void; compact?: boolean;
}) {
  const { t, locale, money, user } = useApp();
  const r = t.rentals;
  const ar = locale === "ar";
  const [q, setQ] = useState<RentalQuery>({
    city: initial?.city ?? "RUH", pickupSpot: initial?.pickupSpot ?? "airport", dropoffCity: initial?.dropoffCity ?? initial?.city ?? "RUH", dropoffSpot: initial?.dropoffSpot ?? "airport",
    pickupAt: initial?.pickupAt ?? ksaAt(3, 10), returnAt: initial?.returnAt ?? ksaAt(6, 10), driverAge: initial?.driverAge ?? 30, licenceCountry: initial?.licenceCountry || user?.individual?.nationality || "",
  });
  const [data, setData] = useState<Options | null>(null);
  const [loading, setLoading] = useState(false);
  const [pick, setPick] = useState<string | null>(null);
  const [extras, setExtras] = useState<RentalExtra[]>([]);
  const [accept, setAccept] = useState(false);
  const [driverName, setDriverName] = useState(initialDriver || user?.individual?.fullName || "");
  const [phone, setPhone] = useState(user?.individual?.phone ?? user?.company?.phone ?? "");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [company, setCompany] = useState<string | null>(null);
  const [cls, setCls] = useState<CarClass | null>(null);
  const [limit, setLimit] = useState(12);
  const errText = (code: string) => (r.errors as Record<string, string>)[code] ?? r.errors.generic;
  const set = <K extends keyof RentalQuery>(k: K, v: RentalQuery[K]) => {
    setQ((x) => {
      const n = { ...x, [k]: v };
      if (k === "city") {
        n.dropoffCity = v as string;
        if (!AIRPORTS[v as string]) n.pickupSpot = n.dropoffSpot = "city";
      }
      if (k === "dropoffCity" && !AIRPORTS[v as string]) n.dropoffSpot = "city";
      return n;
    });
    setData(null);
  };

  async function search() {
    setLoading(true);
    setErr(null);
    const res = await fetch("/api/rentals/options", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(q) }).catch(() => null);
    const d = await res?.json().catch(() => ({}));
    setLoading(false);
    if (!res?.ok) return setErr(errText(d?.error));
    setData(d);
    setPick((d.quotes as RentalQuote[]).find((x) => x.minAge <= q.driverAge)?.quoteId ?? null);
    setExtras([]);
    setCompany(null);
    setCls(null);
    setLimit(12);
  }
  useEffect(() => {
    if (initial?.city && initial.licenceCountry) void search();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const chosen = data?.quotes.find((x) => x.quoteId === pick) ?? null;
  const total = chosen ? chosen.totalSAR + extras.reduce((s, e) => s + (chosen.extras[e] ?? 0), 0) : 0;

  async function send() {
    if (!chosen) return;
    setBusy(true);
    setErr(null);
    const res = await fetch("/api/rentals", {
      method: "POST", headers: { "content-type": "application/json" },
      body: JSON.stringify({ ...q, bookingId, providerId: chosen.providerId, quoteId: chosen.quoteId, extras, driverName, phone, acceptLicence: accept }),
    }).catch(() => null);
    const d = await res?.json().catch(() => ({}));
    setBusy(false);
    if (!res?.ok) return setErr(errText(d?.error));
    onDone?.(d.rental);
  }

  const citySelect = (id: string, value: string, on: (v: string) => void) => (
    <Select id={id} value={value} onChange={(e) => on(e.target.value)}>
      {SAUDI_CITIES.map((c) => <option key={c.code} value={c.code}>{ar ? c.ar : c.en}</option>)}
    </Select>
  );
  const spotSelect = (id: string, city: string, value: RentalSpot, on: (v: RentalSpot) => void) => (
    <Select id={id} value={value} onChange={(e) => on(e.target.value as RentalSpot)}>
      {AIRPORTS[city] && <option value="airport">{r.spots.airport}</option>}
      <option value="city">{r.spots.city}</option>
    </Select>
  );

  return (
    <div className="space-y-4" data-testid="rental-search">
      <div className={cx("grid gap-3", compact ? "sm:grid-cols-2" : "sm:grid-cols-2 lg:grid-cols-4")}>
        <Field label={r.city} htmlFor="rn-city">{citySelect("rn-city", q.city, (v) => set("city", v))}</Field>
        <Field label={r.pickupSpot} htmlFor="rn-pspot">{spotSelect("rn-pspot", q.city, q.pickupSpot, (v) => set("pickupSpot", v))}</Field>
        <Field label={r.dropoffCity} htmlFor="rn-dcity">{citySelect("rn-dcity", q.dropoffCity, (v) => set("dropoffCity", v))}</Field>
        <Field label={r.dropoffSpot} htmlFor="rn-dspot">{spotSelect("rn-dspot", q.dropoffCity, q.dropoffSpot, (v) => set("dropoffSpot", v))}</Field>
        <Field label={r.pickupAt} htmlFor="rn-from"><Input id="rn-from" type="datetime-local" value={q.pickupAt} onChange={(e) => set("pickupAt", e.target.value)} data-testid="rental-from" /></Field>
        <Field label={r.returnAt} htmlFor="rn-to"><Input id="rn-to" type="datetime-local" value={q.returnAt} onChange={(e) => set("returnAt", e.target.value)} data-testid="rental-to" /></Field>
        <Field label={r.driverAge} htmlFor="rn-age"><Input id="rn-age" type="number" min={18} max={99} value={q.driverAge} onChange={(e) => set("driverAge", Number(e.target.value))} data-testid="rental-age" /></Field>
        <Field label={r.licenceCountry} htmlFor="rn-lic">
          <Select id="rn-lic" value={q.licenceCountry} onChange={(e) => set("licenceCountry", e.target.value)} data-testid="rental-licence-country">
            <option value="">…</option>
            {[...COUNTRIES].sort((a, b) => (ar ? a.ar.localeCompare(b.ar, "ar") : a.en.localeCompare(b.en))).map((c) => <option key={c.iso2} value={c.iso2}>{ar ? c.ar : c.en}</option>)}
          </Select>
        </Field>
      </div>
      <div className="flex flex-wrap gap-2">
        <Button onClick={() => void search()} loading={loading} data-testid="rental-searchbtn"><CarIcon className="size-4" />{r.search}</Button>
        {onCancel && <Button variant="ghost" onClick={onCancel}>{t.common.cancel}</Button>}
      </div>
      {err && !data && <Alert tone="error"><span data-testid="rental-error">{err}</span></Alert>}
      {loading && !data && <div className="grid h-16 place-items-center text-brand-700"><Spinner className="size-6" /></div>}

      {data && (
        <div className="space-y-4">
          {data.quotes.length === 0 ? (
            <p className="text-sm text-slate-500">{r.noOffers}</p>
          ) : (
            <div className="space-y-2">
              <p className="text-xs text-slate-500">{fmt(r.offersCount, { n: data.quotes.length, c: data.companies.length })} · {r.cheapest}</p>
              <div className="flex flex-wrap gap-1.5" role="group" aria-label={r.company} data-testid="rental-companies">
                <Chip active={!company} onClick={() => { setCompany(null); setLimit(12); }}>{r.allCompanies}</Chip>
                {data.companies.map((c) => (
                  <Chip key={c.id} active={company === c.id} onClick={() => { setCompany(company === c.id ? null : c.id); setLimit(12); }} testId={`rental-company-${c.id}`}>
                    <CompanyBadge brand={c} size="sm" />
                  </Chip>
                ))}
              </div>
              <div className="flex flex-wrap gap-1.5" role="group">
                <Chip active={!cls} onClick={() => setCls(null)}>{r.allClasses}</Chip>
                {CAR_CLASSES.filter((k) => data.quotes.some((x) => x.carClass === k)).map((k) => <Chip key={k} active={cls === k} onClick={() => setCls(cls === k ? null : k)}>{r.classes[k]}</Chip>)}
              </div>
            </div>
          )}
          {data.quotes.length > 0 && (() => {
            const list = data.quotes.filter((x) => (!company || x.providerId === company) && (!cls || x.carClass === cls));
            return (
            <>
            <div className="grid grid-cols-[minmax(0,1fr)] gap-2 sm:grid-cols-2 lg:grid-cols-3">
              {list.slice(0, limit).map((x) => {
                const young = q.driverAge < x.minAge;
                return (
                  <button key={x.quoteId} type="button" disabled={young} aria-pressed={pick === x.quoteId} onClick={() => setPick(x.quoteId)} data-testid="rental-quote"
                    className={cx("rounded-xl p-3 text-start ring-1", pick === x.quoteId ? "bg-brand-50 ring-2 ring-brand-600" : young ? "cursor-not-allowed bg-slate-50 opacity-60 ring-slate-200" : "bg-white ring-slate-200 hover:ring-brand-600")}>
                    <span className="mb-2 flex items-center justify-between gap-2">
                      <CompanyBadge brand={data.companies.find((c) => c.id === x.providerId)} fallback={ar ? x.providerNameAr : x.providerNameEn} />
                      {x.sandbox && <span className="text-[10px] font-semibold text-amber-700">{t.umrah.sample}</span>}
                    </span>
                    <span className="flex items-start justify-between gap-2">
                      <span className="font-bold">{r.classes[x.carClass]}</span>
                      <span className="text-end">
                        <span className="ltr-nums block font-bold text-brand-800">{money(x.totalSAR)}</span>
                        <span className="block text-[11px] text-slate-500">{fmt(r.perDay, { amount: money(x.pricePerDaySAR) })}</span>
                      </span>
                    </span>
                    <span className="mt-1 block text-xs text-slate-600" dir="auto">{fmt(r.orSimilar, { model: x.model })}</span>
                    <span className="mt-1 block text-xs text-slate-500">{fmt(r.seats, { n: x.seats, bags: x.bags })} · {x.automatic ? r.automatic : r.manual} · {x.kmPerDay ? fmt(r.kmPerDay, { n: x.kmPerDay }) : r.unlimitedKm}</span>
                    <span className="mt-1 block text-xs text-slate-500">{fmt(r.minAge, { n: x.minAge })} · {fmt(r.deposit, { amount: money(x.depositSAR) })}</span>
                    {young && <Badge tone="amber" className="mt-1">{fmt(r.tooYoung, { n: x.minAge })}</Badge>}
                  </button>
                );
              })}
            </div>
            {list.length > limit && <Button variant="secondary" size="sm" onClick={() => setLimit(limit + 12)} data-testid="rental-more">{fmt(r.showMore, { n: list.length - limit })}</Button>}
            </>
            );
          })()}

          {chosen && (
            <>
              <div className="rounded-xl bg-slate-50 p-4 text-sm">
                <p className="font-semibold">{fmt(r.total, { amount: money(chosen.totalSAR), days: chosen.days })}</p>
                {chosen.oneWayFeeSAR > 0 && <p className="text-xs text-slate-600">{fmt(r.oneWay, { amount: money(chosen.oneWayFeeSAR) })}</p>}
                <p className="text-xs text-slate-600">{fmt(r.deposit, { amount: money(chosen.depositSAR) })} · {fmt(r.freeCancel, { n: chosen.freeCancelHours })}</p>
                <p className="mb-1.5 mt-3 text-xs font-semibold text-slate-600">{r.extras.title}</p>
                <div className="flex flex-wrap gap-x-4 gap-y-2">
                  {RENTAL_EXTRAS.filter((e) => chosen.extras[e] !== undefined).map((e) => (
                    <label key={e} className="flex items-center gap-2">
                      <input type="checkbox" className="accent-brand-700" checked={extras.includes(e)} onChange={(ev) => setExtras(ev.target.checked ? [...extras, e] : extras.filter((x) => x !== e))} data-testid={`rental-extra-${e}`} />
                      {r.extras[e]} <span className="ltr-nums text-xs text-slate-500">+{money(chosen.extras[e]!)}</span>
                    </label>
                  ))}
                </div>
              </div>
              <LicenceBox licence={data.licence} reviewed={data.reviewed} sourceUrl={data.sourceUrl} />
              {!user ? (
                <Link href={`/${locale}/login?next=/${locale}/transport`} className="inline-flex h-11 items-center rounded-lg bg-brand-700 px-5 text-sm font-semibold text-white">{r.signIn}</Link>
              ) : (
                <>
                  <label className="flex items-start gap-2 text-sm font-semibold">
                    <input type="checkbox" className="mt-1 accent-brand-700" checked={accept} onChange={(e) => setAccept(e.target.checked)} data-testid="rental-accept" />{r.licenceAccept}
                  </label>
                  <div className="grid gap-3 sm:grid-cols-2">
                    <Field label={r.driverName}><Input value={driverName} onChange={(e) => setDriverName(e.target.value)} dir="auto" data-testid="rental-driver" /></Field>
                    <Field label={r.phone}><Input type="tel" value={phone} onChange={(e) => setPhone(e.target.value)} dir="ltr" data-testid="rental-phone" /></Field>
                  </div>
                  <p className="text-base font-bold">{r.grandTotal}: <span className="ltr-nums text-brand-800" data-testid="rental-total">{money(total)}</span></p>
                  <p className="text-xs text-slate-500">{r.payNote}</p>
                  {chosen.sandbox && <p className="text-xs font-semibold text-amber-700">{r.sandbox}</p>}
                  {err && <Alert tone="error"><span data-testid="rental-error">{err}</span></Alert>}
                  <Button loading={busy} disabled={!accept} onClick={send} data-testid="rental-send">{r.send}</Button>
                </>
              )}
            </>
          )}
        </div>
      )}
    </div>
  );
}

function Chip({ active, onClick, children, testId }: { active: boolean; onClick: () => void; children: React.ReactNode; testId?: string }) {
  return (
    <button type="button" aria-pressed={active} onClick={onClick} data-testid={testId}
      className={cx("inline-flex h-9 items-center rounded-full border px-3 text-xs font-semibold transition-colors", active ? "border-brand-700 bg-brand-50 ring-1 ring-brand-700" : "border-slate-300 bg-white text-slate-700 hover:border-brand-500")}>
      {children}
    </button>
  );
}
