"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { fmt } from "@/i18n";
import { COUNTRIES, countryName } from "@/lib/data/countries";
import type { EmergencyContext } from "@/lib/emergency/context";
import { EMERGENCY_NUMBERS, PHRASES, SOURCES } from "@/lib/emergency/data";
import type { NearbyKind, NearbyPlace } from "@/lib/emergency/nearby";
import { CITY_CENTERS } from "@/lib/guide/centers";
import { directionsLinks } from "@/lib/guide/geo";
import { useApp } from "../app-provider";
import { DirectionsIcon, GlobeIcon, HeartPulseIcon, LocateIcon, MapPinIcon, PassportIcon, PhoneIcon, ShieldIcon, XIcon } from "../icons";
import { Alert, Badge, Button, Card, cx, Select, Spinner } from "../ui";

type Loc = { lat: number; lng: number; accuracy: number | null; demo: boolean };
const KINDS: NearbyKind[] = ["hospital", "pharmacy", "police"];
const MAPS_QUERY: Record<NearbyKind, string> = { hospital: "hospital", pharmacy: "pharmacy", police: "police station" };

function Nearby({ loc }: { loc: Loc }) {
  const { t, locale } = useApp();
  const e = t.emergency;
  const [kind, setKind] = useState<NearbyKind>("hospital");
  const [places, setPlaces] = useState<NearbyPlace[] | null>(null);
  useEffect(() => {
    setPlaces(null);
    fetch(`/api/emergency/nearby?kind=${kind}&lat=${loc.lat.toFixed(4)}&lng=${loc.lng.toFixed(4)}`)
      .then((r) => (r.ok ? r.json() : { places: [] }))
      .then((d) => setPlaces(d.places))
      .catch(() => setPlaces([]));
  }, [kind, loc.lat, loc.lng]);
  const maps = `https://www.google.com/maps/search/${encodeURIComponent(MAPS_QUERY[kind])}/@${loc.lat},${loc.lng},14z`;
  return (
    <Card className="p-5" data-testid="nearby">
      <h2 className="font-bold">{e.nearby}</h2>
      <div role="tablist" className="mt-3 flex flex-wrap gap-2">
        {KINDS.map((k) => (
          <button key={k} role="tab" aria-selected={kind === k} onClick={() => setKind(k)} data-testid={`nearby-${k}`}
            className={cx("h-9 rounded-full px-4 text-sm font-semibold", kind === k ? "bg-red-600 text-white" : "bg-white text-slate-700 ring-1 ring-slate-200 hover:bg-slate-50")}>
            {e.kinds[k]}
          </button>
        ))}
      </div>
      {!places ? (
        <div className="mt-4 h-24 animate-pulse rounded-lg bg-slate-50" />
      ) : places.length === 0 ? (
        <p className="mt-4 text-sm text-slate-500">{e.noneFound}</p>
      ) : (
        <ul className="mt-3 divide-y divide-slate-100">
          {places.map((p) => {
            const name = (locale === "ar" ? p.nameAr ?? p.nameEn : p.nameEn ?? p.nameAr) ?? e.unnamed[p.kind];
            return (
              <li key={p.id} className="flex items-center justify-between gap-3 py-2.5" data-testid="nearby-place">
                <div className="min-w-0">
                  <p className="truncate text-sm font-semibold text-ink">{name}</p>
                  <p className="flex flex-wrap items-center gap-2 text-xs text-slate-500">
                    <span className="ltr-nums">{fmt(e.km, { d: p.km < 1 ? p.km.toFixed(2) : p.km.toFixed(1) })}</span>
                    {p.emergency && <Badge tone="red">{e.emergencyDept}</Badge>}
                    {p.open24h && <Badge tone="brand">{e.open24h}</Badge>}
                  </p>
                </div>
                <div className="flex shrink-0 gap-2">
                  {p.phone && <a href={`tel:${p.phone.replace(/[^\d+]/g, "")}`} className="grid size-9 place-items-center rounded-lg bg-slate-100 text-slate-700 hover:bg-slate-200" aria-label={`${e.call} ${name}`}><PhoneIcon className="size-4" /></a>}
                  <a href={directionsLinks(p).google} target="_blank" rel="noopener noreferrer" className="inline-flex h-9 items-center gap-1.5 rounded-lg bg-brand-50 px-3 text-xs font-semibold text-brand-800 hover:bg-brand-100">
                    <DirectionsIcon className="size-4" />{e.directions}
                  </a>
                </div>
              </li>
            );
          })}
        </ul>
      )}
      <div className="mt-3 flex flex-wrap items-center justify-between gap-2 text-xs text-slate-400">
        <span>{e.osm}</span>
        <a href={maps} target="_blank" rel="noopener noreferrer" className="font-semibold text-brand-700 underline">{e.searchMaps}</a>
      </div>
    </Card>
  );
}

/** Service 12 — emergency: one-tap calls, location to share, nearest help, insurance, embassy, phrases. */
export function EmergencyView() {
  const { t, locale, user } = useApp();
  const e = t.emergency;
  const [ctx, setCtx] = useState<EmergencyContext | null>(null);
  const [loc, setLoc] = useState<Loc | null>(null);
  const [locState, setLocState] = useState<"locating" | "ok" | "denied">("locating");
  const [address, setAddress] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [phrase, setPhrase] = useState<(typeof PHRASES)[number] | null>(null);
  const [nat, setNat] = useState("");

  useEffect(() => {
    fetch("/api/emergency/context").then((r) => r.json()).then((c: EmergencyContext) => {
      setCtx(c);
      setNat((n) => n || c.nationality || "");
    }).catch(() => setCtx({ demo: false, nationality: null, insurance: null }));
  }, []);

  const locate = useCallback(() => {
    setLocState("locating");
    if (!navigator.geolocation) return setLocState("denied");
    navigator.geolocation.getCurrentPosition(
      (p) => {
        setLoc({ lat: p.coords.latitude, lng: p.coords.longitude, accuracy: Math.round(p.coords.accuracy), demo: false });
        setLocState("ok");
      },
      () => setLocState("denied"),
      { enableHighAccuracy: true, timeout: 12_000, maximumAge: 60_000 },
    );
  }, []);
  useEffect(locate, [locate]);

  // Sandbox: a sample location when the device location isn't available.
  useEffect(() => {
    if (locState === "denied" && ctx?.demo && !loc) setLoc({ ...CITY_CENTERS.RUH, accuracy: null, demo: true });
  }, [locState, ctx, loc]);

  useEffect(() => {
    if (!loc) return;
    setAddress(null);
    fetch(`/api/emergency/address?lat=${loc.lat.toFixed(5)}&lng=${loc.lng.toFixed(5)}&locale=${locale}`)
      .then((r) => (r.ok ? r.json() : { address: null }))
      .then((d) => setAddress(d.address))
      .catch(() => undefined);
  }, [loc, locale]);

  const link = loc ? `https://maps.google.com/?q=${loc.lat.toFixed(6)},${loc.lng.toFixed(6)}` : "";
  const text = fmt(e.shareText, { link });
  const main = EMERGENCY_NUMBERS.find((n) => n.primary)!;
  const country = COUNTRIES.find((c) => c.iso2 === nat && c.iso2 !== "SA");

  async function copy() {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      /* clipboard unavailable */
    }
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">{e.title}</h1>
        <p className="mt-1 max-w-3xl text-sm text-slate-600">{e.intro}</p>
      </div>

      <div className="grid grid-cols-[minmax(0,1fr)] gap-4 lg:grid-cols-2">
        <a href={`tel:${main.number}`} className="flex items-center gap-4 rounded-2xl bg-red-600 p-6 text-white shadow-lg shadow-red-600/20 hover:bg-red-700" data-testid="call-911">
          <span className="grid size-16 shrink-0 place-items-center rounded-full bg-white/15 ring-4 ring-white/20"><PhoneIcon className="size-8" /></span>
          <span>
            <span className="block text-2xl font-bold">{e.callMain}</span>
            <span className="mt-1 block text-sm text-red-50">{e.callMainHint}</span>
          </span>
        </a>

        <Card className="p-5" data-testid="my-location">
          <div className="flex items-center justify-between gap-2">
            <h2 className="flex items-center gap-2 font-bold"><LocateIcon className="size-5 text-red-600" />{e.location}</h2>
            <button type="button" onClick={locate} className="text-xs font-semibold text-brand-700 underline">{e.retry}</button>
          </div>
          {locState === "locating" && !loc && <p className="mt-3 flex items-center gap-2 text-sm text-slate-500"><Spinner className="size-4" />{e.locating}</p>}
          {locState === "denied" && !loc && <Alert tone="warning" className="mt-3">{e.locationDenied}</Alert>}
          {loc && (
            <div className="mt-3 space-y-2 text-sm">
              {loc.demo && <Badge tone="amber">{e.demoLocation}</Badge>}
              <p><span className="text-slate-500">{e.coords}: </span><b className="ltr-nums" dir="ltr" data-testid="coords">{loc.lat.toFixed(5)}, {loc.lng.toFixed(5)}</b>{loc.accuracy !== null && <span className="text-xs text-slate-400"> · {fmt(e.accuracy, { m: loc.accuracy })}</span>}</p>
              {address && <p><span className="text-slate-500">{e.address}: </span>{address}</p>}
              <p className="pt-1 text-xs font-semibold text-slate-600">{e.share}</p>
              <div className="flex flex-wrap gap-2">
                <a href={`https://wa.me/?text=${encodeURIComponent(text)}`} target="_blank" rel="noopener noreferrer" className="inline-flex h-10 items-center rounded-lg bg-[#1f9d55] px-4 text-sm font-semibold text-white" data-testid="share-whatsapp">{e.shareWhatsapp}</a>
                <a href={`sms:?&body=${encodeURIComponent(text)}`} className="inline-flex h-10 items-center rounded-lg bg-slate-800 px-4 text-sm font-semibold text-white">{e.shareSms}</a>
                <Button size="sm" variant="secondary" onClick={copy} className="h-10">{copied ? e.copied : e.copy}</Button>
              </div>
            </div>
          )}
        </Card>
      </div>

      <Card className="p-5">
        <h2 className="font-bold">{e.otherNumbers}</h2>
        <ul className="mt-3 grid gap-2 sm:grid-cols-2 lg:grid-cols-3" data-testid="numbers">
          {EMERGENCY_NUMBERS.filter((n) => !n.primary).map((n) => (
            <li key={n.id}>
              <a href={`tel:${n.number}`} className="flex items-center gap-3 rounded-xl border border-slate-200 p-3 hover:border-red-300 hover:bg-red-50/50" data-testid={`number-${n.id}`}>
                <span className="ltr-nums grid h-12 w-16 shrink-0 place-items-center rounded-lg bg-red-50 text-lg font-bold text-red-700">{n.number}</span>
                <span className="min-w-0">
                  <span className="block text-sm font-semibold text-ink">{e.numbers[n.id].name}</span>
                  <span className="block text-xs text-slate-500">{e.numbers[n.id].desc}</span>
                </span>
              </a>
            </li>
          ))}
        </ul>
        <p className="mt-3 text-xs text-slate-400">
          <a href={SOURCES.portal} target="_blank" rel="noopener noreferrer" className="underline">{e.numbersSource}</a>
        </p>
      </Card>

      {loc && <Nearby loc={loc} />}

      <div className="grid grid-cols-[minmax(0,1fr)] gap-4 lg:grid-cols-2">
        <Card className="p-5" data-testid="insurance">
          <h2 className="flex items-center gap-2 font-bold"><HeartPulseIcon className="size-5 text-red-600" />{e.insurance}</h2>
          <p className="mt-1 text-sm text-slate-600">{e.insuranceIntro}</p>
          {!user ? (
            <Link href={`/${locale}/login?next=/${locale}/emergency`} className="mt-3 inline-block text-sm font-semibold text-brand-700 underline">{e.signIn}</Link>
          ) : !ctx ? null : ctx.insurance ? (
            <div className="mt-3 space-y-2 text-sm">
              <p className="font-semibold">{fmt(e.insuranceTrip, { ref: ctx.insurance.reference })} <span className="ltr-nums text-xs font-normal text-slate-500">{ctx.insurance.departureDate} → {ctx.insurance.returnDate}</span></p>
              <ul className="space-y-1">
                {ctx.insurance.travellers.map((tr, i) => (
                  <li key={i} className="flex items-center justify-between gap-2"><span>{tr.name}</span><Badge tone={tr.issued ? "brand" : "amber"}>{tr.issued ? e.insuranceIssued : e.insurancePending}</Badge></li>
                ))}
              </ul>
              <Link href={`/${locale}/account/wallet`} className="inline-flex h-10 items-center gap-2 rounded-lg bg-brand-800 px-4 text-sm font-semibold text-white hover:bg-brand-900"><ShieldIcon className="size-4" />{e.openWallet}</Link>
            </div>
          ) : (
            <p className="mt-3 text-sm text-slate-500">{e.insuranceNone}</p>
          )}
        </Card>

        <Card className="p-5" data-testid="embassy">
          <h2 className="flex items-center gap-2 font-bold"><GlobeIcon className="size-5 text-brand-700" />{e.embassy}</h2>
          <p className="mt-1 text-sm text-slate-600">{e.embassyIntro}</p>
          <div className="mt-3 w-64 max-w-full">
            <Select value={nat} onChange={(x) => setNat(x.target.value)} aria-label={e.nationality} className="h-10" data-testid="nationality">
              <option value="">{e.nationality}</option>
              {COUNTRIES.filter((c) => c.iso2 !== "SA").map((c) => <option key={c.iso2} value={c.iso2}>{locale === "ar" ? c.ar : c.en}</option>)}
            </Select>
          </div>
          {country && (
            <div className="mt-3 space-y-2 text-sm">
              <p className="font-semibold" data-testid="embassy-name">{fmt(e.embassyOf, { country: countryName(country.iso2, locale) })}</p>
              <div className="flex flex-wrap gap-2">
                <a href={`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(`Embassy of ${country.en} Riyadh`)}`} target="_blank" rel="noopener noreferrer" className="inline-flex h-9 items-center gap-1.5 rounded-lg bg-brand-50 px-3 text-xs font-semibold text-brand-800 hover:bg-brand-100"><MapPinIcon className="size-4" />{e.embassyMap}</a>
                <a href={`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(`Consulate General of ${country.en} Jeddah`)}`} target="_blank" rel="noopener noreferrer" className="inline-flex h-9 items-center gap-1.5 rounded-lg bg-slate-100 px-3 text-xs font-semibold text-slate-700 hover:bg-slate-200"><MapPinIcon className="size-4" />{e.consulateMap}</a>
              </div>
            </div>
          )}
          <a href="https://www.mofa.gov.sa/" target="_blank" rel="noopener noreferrer" className="mt-3 inline-block text-xs font-semibold text-brand-700 underline">{e.mofa}</a>
        </Card>
      </div>

      <Card className="p-5" data-testid="phrases">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 className="font-bold">{e.phrases}</h2>
          <Link href={`/${locale}/translate`} className="text-sm font-semibold text-brand-700 underline">{e.translate}</Link>
        </div>
        <p className="mt-1 text-sm text-slate-600">{e.phrasesIntro}</p>
        <div className="mt-3 grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
          {PHRASES.map((ph) => (
            <button key={ph.id} type="button" onClick={() => setPhrase(ph)} className="rounded-xl border border-slate-200 p-3 text-start hover:border-brand-300 hover:bg-brand-50/40" data-testid="phrase">
              <span className="block text-lg font-bold text-ink" dir="rtl">{ph.ar}</span>
              <span className="mt-0.5 block text-xs italic text-slate-500" dir="ltr">{ph.say}</span>
              <span className="block text-xs text-slate-600" dir="ltr">{ph.en}</span>
            </button>
          ))}
        </div>
      </Card>

      <Card className="p-5" data-testid="lost-passport">
        <h2 className="flex items-center gap-2 font-bold"><PassportIcon className="size-5 text-brand-700" />{e.passport}</h2>
        <ol className="mt-3 list-decimal space-y-1.5 ps-5 text-sm leading-6 text-slate-700">
          {e.passportSteps.map((s) => <li key={s}>{s}</li>)}
        </ol>
        <Link href={`/${locale}/account/wallet`} className="mt-3 inline-block text-sm font-semibold text-brand-700 underline">{e.walletPassport}</Link>
      </Card>

      {phrase && (
        <div role="dialog" aria-modal="true" className="fixed inset-0 z-[800] flex flex-col items-center justify-center gap-6 bg-white p-6 text-center" data-testid="phrase-full">
          <button type="button" onClick={() => setPhrase(null)} aria-label={e.close} className="absolute end-4 top-4 grid size-11 place-items-center rounded-full bg-slate-100"><XIcon className="size-5" /></button>
          <p className="text-5xl font-bold leading-tight text-ink sm:text-7xl" dir="rtl">{phrase.ar}</p>
          <p className="text-2xl text-slate-600" dir="ltr">{phrase.en}</p>
          <p className="text-lg italic text-slate-400" dir="ltr">{phrase.say}</p>
        </div>
      )}
    </div>
  );
}
