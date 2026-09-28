"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { fmt } from "@/i18n";
import { EMAIL_RE } from "@/lib/auth/validation";
import { ORIGIN_CITIES, SAUDI_CITIES } from "@/lib/data/cities";
import { earnPoints } from "@/lib/loyalty/rules";
import { validatePhone } from "@/lib/phone";
import { STOPOVER, type DocType } from "@/lib/standalone/entry";
import type { CabinClass, FlightOffer } from "@/lib/types";
import { useApp } from "../app-provider";
import { CountrySelect } from "../booking/country-select";
import { PlaneIcon } from "../icons";
import { Checkout, type PaymentRef } from "../payments/checkout";
import { PhoneInput } from "../phone-input";
import { Alert, Badge, Button, Card, cx, Field, Input, Select, Spinner } from "../ui";
import { errText, StandaloneShell, useEntry } from "./shell";

type Trip = "oneway" | "return" | "stopover";
type PaxType = "adult" | "child" | "infant";
interface Option { ref: string; nameEn: string; nationality: string; passportMasked: string; birthDate: string | null }
interface Pax { type: PaxType; ref: string; nameEn: string; nationality: string; docType: DocType; docNo: string; birthDate: string; passportExpiry: string }

const pad = (n: number) => String(n).padStart(2, "0");
const ksaDay = (plus: number) => {
  const d = new Date(Date.now() + 3 * 3_600_000 + plus * 86_400_000);
  return `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}`;
};
const SAUDI = new Set(SAUDI_CITIES.map((c) => c.code));
const blank = (type: PaxType): Pax => ({ type, ref: "", nameEn: "", nationality: "", docType: "passport", docNo: "", birthDate: "", passportExpiry: "" });

/** Flights without a package: domestic, to or from the Kingdom, and stopovers of up to 96 hours. */
export function FlightsView() {
  const { t, locale, money, user } = useApp();
  const s = t.standalone;
  const f = s.flights;
  const ar = locale === "ar";
  const router = useRouter();
  const [entry, setEntry] = useEntry();
  const [trip, setTrip] = useState<Trip>("oneway");
  const [q, setQ] = useState({ from: "RUH", to: "JED", via: "RUH", date: ksaDay(10), back: ksaDay(14), cabin: "economy" as CabinClass });
  const [counts, setCounts] = useState({ adults: 1, children: 0, infants: 0 });
  const [legs, setLegs] = useState<(FlightOffer[] | null)[]>([null, null]);
  const [picked, setPicked] = useState<(FlightOffer | null)[]>([null, null]);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [options, setOptions] = useState<Option[]>([]);
  const [pax, setPax] = useState<Pax[]>([blank("adult")]);
  const [contact, setContact] = useState({ email: "", phone: "" });

  // Stopover visitors fly in and out again; everyone else chooses one way or return.
  useEffect(() => {
    if (entry === "stopover") {
      setTrip("stopover");
      setQ((x) => ({ ...x, from: SAUDI.has(x.from) ? "CAI" : x.from, via: SAUDI.has(x.via) ? x.via : "RUH", to: SAUDI.has(x.to) ? "DXB" : x.to, back: ksaDay(12) }));
    } else if (trip === "stopover") setTrip("oneway");
  }, [entry]); // eslint-disable-line react-hooks/exhaustive-deps
  // "Complete your trip" from a hotel booking: ?to=JED&date=…&back=…&trip=return
  useEffect(() => {
    const p = new URLSearchParams(location.search);
    const known = (c: string | null) => !!c && (SAUDI.has(c) || ORIGIN_CITIES.some((o) => o.code === c));
    const day = (d: string | null) => (d && /^\d{4}-\d{2}-\d{2}$/.test(d) && d >= ksaDay(0) ? d : null);
    const to = p.get("to");
    const from = p.get("from");
    const date = day(p.get("date"));
    const back = day(p.get("back"));
    if (!known(to) && !date) return;
    if (p.get("trip") === "return" && back) setTrip("return");
    setQ((x) => {
      const dest = known(to) ? to! : x.to;
      const origin = known(from) && from !== dest ? from! : x.from !== dest ? x.from : dest === "RUH" ? "JED" : "RUH";
      return { ...x, to: dest, from: origin, ...(date ? { date } : {}), ...(back && (!date || back > date) ? { back } : {}) };
    });
  }, []);
  useEffect(() => {
    if (!user) return;
    setContact((c) => ({ email: c.email || user.email, phone: c.phone || user.individual?.phone || user.company?.phone || "" }));
    fetch("/api/trains/passengers").then((r) => (r.ok ? r.json() : { passengers: [] })).then((d) => setOptions(d.passengers ?? [])).catch(() => undefined);
  }, [user]);
  useEffect(() => {
    setPax((cur) => {
      const want: PaxType[] = [...Array(counts.adults).fill("adult"), ...Array(counts.children).fill("child"), ...Array(counts.infants).fill("infant")];
      return want.map((type, i) => (cur[i]?.type === type ? cur[i] : blank(type)));
    });
  }, [counts]);

  const route = trip === "stopover" ? [{ from: q.from, to: q.via, date: q.date }, { from: q.via, to: q.to, date: q.back }] : trip === "return" ? [{ from: q.from, to: q.to, date: q.date }, { from: q.to, to: q.from, date: q.back }] : [{ from: q.from, to: q.to, date: q.date }];
  const domestic = route.every((r) => SAUDI.has(r.from) && SAUDI.has(r.to));

  async function search(e?: React.FormEvent) {
    e?.preventDefault();
    setErr(null);
    setPicked([null, null]);
    setLoading(true);
    const results = await Promise.all(route.map(async (r) => {
      const p = new URLSearchParams({ from: r.from, to: r.to, date: r.date, cabin: q.cabin, adults: String(counts.adults), children: String(counts.children), infants: String(counts.infants) });
      const res = await fetch(`/api/flights/search?${p}`).catch(() => null);
      const d = await res?.json().catch(() => ({}));
      if (!res?.ok) throw new Error(String(d?.error ?? "generic"));
      const list = d.offers as FlightOffer[];
      return trip === "stopover" ? list.filter((o) => (STOPOVER.carriers as readonly string[]).includes(o.carrierCode)) : list;
    })).catch((x: Error) => {
      setErr(errText(s.errors, x.message));
      return null;
    });
    setLoading(false);
    setLegs(results ? [results[0], results[1] ?? null] : [null, null]);
  }

  const total = picked.filter(Boolean).reduce((a, o) => a + (o?.totalSAR ?? 0), 0);
  const allPicked = route.every((_, i) => !!picked[i]);
  const points = allPicked && user?.accountType === "individual" ? earnPoints({ service: "flight", eligibleSAR: total }) : 0;
  const titles = [f.pickOut, trip === "stopover" ? f.pickOnward : f.pickBack];
  const docTypes: DocType[] = domestic ? ["passport", "nationalId", "iqama"] : ["passport"];
  const paxOk = pax.every((p) => (p.ref || (p.nameEn.trim().includes(" ") && p.nationality && p.docNo.trim().length >= 5)) && (p.birthDate || options.find((o) => o.ref === p.ref)?.birthDate) && (domestic || p.passportExpiry || p.ref.startsWith("saved:")));
  const contactErr = { email: EMAIL_RE.test(contact.email.trim()) ? undefined : s.errors.email, phone: validatePhone(contact.phone) ? s.errors.phone : undefined };
  const contactOk = !contactErr.email && !contactErr.phone;

  async function pay(payment: PaymentRef | undefined): Promise<boolean> {
    setErr(null);
    const r = await fetch("/api/flights", {
      method: "POST", headers: { "content-type": "application/json" },
      body: JSON.stringify({
        entry, tripType: trip, offers: picked.filter(Boolean), contact, expectedTotalSAR: total, card: payment,
        passengers: pax.map((p) => {
          const opt = options.find((o) => o.ref === p.ref);
          const extra = { birthDate: p.birthDate || opt?.birthDate || "", ...(p.passportExpiry ? { passportExpiry: p.passportExpiry } : {}) };
          return p.ref ? { type: p.type, ref: p.ref, ...extra } : { type: p.type, nameEn: p.nameEn, nationality: p.nationality, docType: domestic ? p.docType : "passport", docNo: p.docNo, ...extra };
        }),
      }),
    }).catch(() => null);
    const d = await r?.json().catch(() => ({}));
    if (!r?.ok) {
      setErr(errText(s.errors, d?.error));
      return false;
    }
    router.push(`/${locale}/account/flights/${d.order.id}`);
    return true;
  }

  const airport = (code: string) => {
    const c = [...SAUDI_CITIES, ...ORIGIN_CITIES].find((x) => x.code === code);
    return c ? `${ar ? c.ar : c.en} (${code})` : code;
  };
  const citySelect = (id: string, value: string, onChange: (v: string) => void, only?: "saudi" | "abroad") => (
    <Select id={id} value={value} onChange={(e) => onChange(e.target.value)} data-testid={id}>
      {only !== "abroad" && <optgroup label={f.saudi}>{SAUDI_CITIES.map((c) => <option key={c.code} value={c.code}>{airport(c.code)}</option>)}</optgroup>}
      {only !== "saudi" && <optgroup label={f.abroad}>{ORIGIN_CITIES.map((c) => <option key={c.code} value={c.code}>{airport(c.code)}</option>)}</optgroup>}
    </Select>
  );

  return (
    <StandaloneShell tab="flights" entry={entry} onEntry={setEntry}>
      <Card className="space-y-4 p-4 sm:p-5">
        <div className="flex flex-wrap gap-2" role="group" aria-label={f.search}>
          {(entry === "stopover" ? (["stopover"] as Trip[]) : (["oneway", "return"] as Trip[])).map((x) => (
            <button key={x} type="button" aria-pressed={trip === x} onClick={() => setTrip(x)} className={cx("h-9 rounded-full px-4 text-sm font-semibold ring-1 ring-inset", trip === x ? "bg-brand-700 text-white ring-brand-700" : "bg-white text-slate-700 ring-slate-200")} data-testid={`fl-trip-${x}`}>
              {f.trip[x]}
            </button>
          ))}
        </div>
        {trip === "stopover" && <Alert tone="info">{f.stopoverNote}</Alert>}
        <form onSubmit={search} className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4" noValidate>
          <Field label={f.from} htmlFor="fl-from">{citySelect("fl-from", q.from, (v) => setQ({ ...q, from: v }), trip === "stopover" ? "abroad" : undefined)}</Field>
          {trip === "stopover" && <Field label={t.standalone.hotels.city} htmlFor="fl-via">{citySelect("fl-via", q.via, (v) => setQ({ ...q, via: v }), "saudi")}</Field>}
          <Field label={f.to} htmlFor="fl-to">{citySelect("fl-to", q.to, (v) => setQ({ ...q, to: v }), trip === "stopover" ? "abroad" : undefined)}</Field>
          <Field label={f.depart} htmlFor="fl-date"><Input id="fl-date" type="date" dir="ltr" min={ksaDay(0)} value={q.date} onChange={(e) => setQ({ ...q, date: e.target.value })} data-testid="fl-date" /></Field>
          {trip !== "oneway" && <Field label={trip === "stopover" ? f.onwardDate : f.returnDate} htmlFor="fl-back"><Input id="fl-back" type="date" dir="ltr" min={q.date} value={q.back} onChange={(e) => setQ({ ...q, back: e.target.value })} data-testid="fl-back" /></Field>}
          {(["adults", "children", "infants"] as const).map((k) => (
            <Field key={k} label={f.pax[k]} htmlFor={`fl-${k}`}>
              <Select id={`fl-${k}`} value={counts[k]} onChange={(e) => setCounts({ ...counts, [k]: Number(e.target.value) })}>
                {Array.from({ length: k === "adults" ? 9 : k === "infants" ? counts.adults + 1 : 9 }, (_, i) => i + (k === "adults" ? 1 : 0)).map((n) => <option key={n} value={n}>{n}</option>)}
              </Select>
            </Field>
          ))}
          <Field label={f.cabin} htmlFor="fl-cabin">
            <Select id="fl-cabin" value={q.cabin} onChange={(e) => setQ({ ...q, cabin: e.target.value as CabinClass })}>
              {(["economy", "premium", "business", "first"] as const).map((c) => <option key={c} value={c}>{t.search.cabins[c]}</option>)}
            </Select>
          </Field>
          <div className="flex items-end sm:col-span-2 lg:col-span-4"><Button type="submit" loading={loading} data-testid="fl-search">{f.search}</Button></div>
        </form>
      </Card>

      {err && <Alert tone="error"><span data-testid="fl-error">{err}</span></Alert>}
      {loading && <div className="grid place-items-center py-10 text-brand-700"><Spinner className="size-6" /></div>}

      {!loading && legs[0] && route.map((r, i) => (
        <section key={i} className="space-y-3" data-testid={`fl-leg-${i}`}>
          <h2 className="font-bold">{titles[i] ?? f.pickOut}: {airport(r.from)} {ar ? "←" : "→"} {airport(r.to)}</h2>
          {picked[i] ? (
            <FlightRow offer={picked[i]!} onChange={() => setPicked((p) => p.map((x, j) => (j === i ? null : x)))} />
          ) : !legs[i]?.length ? <Alert tone="info">{f.none}</Alert> : (
            <ul className="space-y-2">{legs[i]!.slice(0, 8).map((o) => <li key={o.id}><FlightRow offer={o} onSelect={() => setPicked((p) => p.map((x, j) => (j === i ? o : x)))} /></li>)}</ul>
          )}
        </section>
      ))}

      {allPicked && (
        <div className="grid gap-5 lg:grid-cols-[1fr_380px]">
          <Card className="space-y-4 p-5" data-testid="fl-passengers">
            <h2 className="font-bold">{f.passengers}</h2>
            <p className="text-xs text-slate-600">{domestic ? f.docNoteDomestic : f.docNoteIntl}</p>
            {pax.map((p, i) => {
              const set = (patch: Partial<Pax>) => setPax((cur) => cur.map((x, j) => (j === i ? { ...x, ...patch } : x)));
              const opt = options.find((o) => o.ref === p.ref);
              return (
                <fieldset key={i} className="space-y-3 rounded-xl border border-slate-200 p-4">
                  <legend className="px-1 text-sm font-semibold">{fmt(f.passenger, { n: i + 1 })} · {f.types[p.type]}</legend>
                  {options.length > 0 && (
                    <Field label={f.pick}>
                      <Select value={p.ref} onChange={(e) => set({ ref: e.target.value })}>
                        <option value="">{f.manual}</option>
                        {options.map((o) => <option key={o.ref} value={o.ref}>{o.nameEn} · {o.passportMasked}</option>)}
                      </Select>
                    </Field>
                  )}
                  {!p.ref && (
                    <div className="grid gap-3 sm:grid-cols-2">
                      <Field label={f.nameEn} className="sm:col-span-2"><Input dir="ltr" value={p.nameEn} onChange={(e) => set({ nameEn: e.target.value.toUpperCase() })} data-testid={`fl-name-${i}`} /></Field>
                      <Field label={f.nationality} htmlFor={`fl-nat-${i}`}><CountrySelect id={`fl-nat-${i}`} value={p.nationality} onChange={(v) => set({ nationality: v })} /></Field>
                      {domestic && (
                        <Field label={f.docType}>
                          <Select value={p.docType} onChange={(e) => set({ docType: e.target.value as DocType })} data-testid={`fl-doctype-${i}`}>
                            {docTypes.map((d) => <option key={d} value={d}>{f.docTypes[d]}</option>)}
                          </Select>
                        </Field>
                      )}
                      <Field label={f.docNo}><Input dir="ltr" value={p.docNo} onChange={(e) => set({ docNo: e.target.value.toUpperCase().replace(/\s/g, "") })} data-testid={`fl-doc-${i}`} /></Field>
                    </div>
                  )}
                  <div className="grid gap-3 sm:grid-cols-2">
                    {!(opt?.birthDate) && <Field label={f.birthDate}><Input type="date" dir="ltr" value={p.birthDate} onChange={(e) => set({ birthDate: e.target.value })} data-testid={`fl-birth-${i}`} /></Field>}
                    {!domestic && !p.ref.startsWith("saved:") && <Field label={f.passportExpiry}><Input type="date" dir="ltr" value={p.passportExpiry} onChange={(e) => set({ passportExpiry: e.target.value })} data-testid={`fl-expiry-${i}`} /></Field>}
                  </div>
                </fieldset>
              );
            })}
          </Card>
          <Card className="h-fit space-y-4 p-5" data-testid="fl-book">
            <h2 className="font-bold">{f.contact}</h2>
            <Field label={t.standalone.hotels.email} required error={contact.email.trim() ? contactErr.email : undefined} htmlFor="fl-email"><Input id="fl-email" type="email" dir="ltr" value={contact.email} onChange={(e) => setContact({ ...contact, email: e.target.value })} /></Field>
            <Field label={t.standalone.hotels.phone} required error={contact.phone.trim() ? contactErr.phone : undefined} htmlFor="fl-phone"><PhoneInput id="fl-phone" value={contact.phone} onChange={(phone) => setContact({ ...contact, phone })} defaultCountry={user?.individual?.nationality || "SA"} invalid={!!(contact.phone && contactErr.phone)} testId="fl-phone" /></Field>
            <div className="flex items-center justify-between border-t border-slate-100 pt-3">
              <span className="font-semibold">{f.total}</span>
              <span className="ltr-nums text-lg font-bold text-brand-800" data-testid="fl-total">{money(total)}</span>
            </div>
            {points > 0 && <p className="text-sm font-medium text-gold-700">{fmt(f.earns, { n: points })}</p>}
            {user && (!paxOk || !contactOk) && <p className="text-sm text-amber-800" role="status" data-testid="fl-incomplete">{s.completeForm}</p>}
            {!user ? (
              <Link href={`/${locale}/login?next=/${locale}/flights`} className="inline-flex h-11 w-full items-center justify-center rounded-lg bg-brand-700 font-semibold text-white hover:bg-brand-800">{f.signIn}</Link>
            ) : (
              <Checkout amountSAR={total} description={`Flights ${route.map((r) => `${r.from}-${r.to}`).join(" ")}`} disabled={!paxOk || !contactOk} label={f.pay} onPay={pay} testId="fl-pay" />
            )}
          </Card>
        </div>
      )}
    </StandaloneShell>
  );
}

function FlightRow({ offer, onSelect, onChange }: { offer: FlightOffer; onSelect?: () => void; onChange?: () => void }) {
  const { t, locale, money } = useApp();
  const f = t.standalone.flights;
  const ar = locale === "ar";
  const hm = (iso: string) => iso.slice(11, 16);
  const dur = `${Math.floor(offer.durationMin / 60)}h ${offer.durationMin % 60}m`;
  return (
    <Card className={cx("flex flex-wrap items-center gap-3 p-4", onChange && "ring-2 ring-brand-600/60")} data-testid="fl-offer">
      <div className="grid size-10 shrink-0 place-items-center rounded-lg bg-brand-50 text-brand-700"><PlaneIcon className="size-5" /></div>
      <div className="min-w-0 flex-1">
        <p className="font-semibold">
          <span className="ltr-nums">{hm(offer.departAt)}</span> {offer.from} {ar ? "←" : "→"} <span className="ltr-nums">{hm(offer.arriveAt)}</span> {offer.to}
          <span className="ms-2 text-xs font-normal text-slate-500 ltr-nums">{offer.departAt.slice(0, 10)} · {dur}</span>
        </p>
        <p className="mt-0.5 text-xs text-slate-600">{ar ? offer.carrierNameAr : offer.carrierNameEn} · <span className="ltr-nums">{offer.flightNo}</span> · {offer.stops ? fmt(f.stops, { n: offer.stops }) : f.direct} · {fmt(f.baggage, { kg: offer.baggageKg })} · {t.common.agent}: {ar ? offer.agentNameAr : offer.agentNameEn}</p>
        <Badge tone={offer.refundable ? "brand" : "slate"} className="mt-1">{offer.refundable ? f.refundable : f.nonRefundable}</Badge>
      </div>
      <div className="flex items-center gap-3">
        <span className="ltr-nums text-lg font-bold text-brand-800">{money(offer.totalSAR)}</span>
        {onSelect && <Button size="sm" onClick={onSelect} data-testid="fl-select">{f.select}</Button>}
        {onChange && <Button size="sm" variant="secondary" onClick={onChange}>{f.change}</Button>}
      </div>
    </Card>
  );
}
