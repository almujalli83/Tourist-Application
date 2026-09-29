"use client";

import { useEffect, useMemo, useState } from "react";
import { fmt } from "@/i18n";
import { cityName, SAUDI_CITIES } from "@/lib/data/cities";
import { convertFromSAR, convertToSAR, CURRENCIES, formatIn, getCurrency } from "@/lib/currency";
import type { NearbyPlace } from "@/lib/emergency/nearby";
import { CITY_CENTERS } from "@/lib/guide/centers";
import { directionsLinks } from "@/lib/guide/geo";
import { useApp } from "../app-provider";
import { CardIcon, CheckIcon, DirectionsIcon, LocateIcon, RefreshIcon } from "../icons";
import { Card, cx, Field, Input, Select, Spinner } from "../ui";

const QUICK = [10, 50, 100, 500, 1000];

/** Currency converter (live rates, offline-ready), paying in the Kingdom, and nearby ATMs / exchange offices. */
export function MoneyView() {
  const { t, locale, currency, fx } = useApp();
  const m = t.money;
  const ar = locale === "ar";
  const [from, setFrom] = useState("SAR");
  const [to, setTo] = useState(currency === "SAR" ? "USD" : currency);
  const [amount, setAmount] = useState("100");
  const n = Number(amount.replace(",", ".")) || 0;
  // Through SAR: amount (from) → SAR → to. Recomputed when the live rates arrive (fx).
  const result = useMemo(() => convertFromSAR(from === "SAR" ? n : convertToSAR(n, from), to), [n, from, to, fx]); // eslint-disable-line react-hooks/exhaustive-deps
  const unit = useMemo(() => convertFromSAR(from === "SAR" ? 1 : convertToSAR(1, from), to), [from, to, fx]); // eslint-disable-line react-hooks/exhaustive-deps
  const name = (code: string) => `${code} — ${ar ? getCurrency(code).nameAr : getCurrency(code).nameEn}`;

  return (
    <div className="space-y-6" data-testid="money-view">
      <div>
        <h1 className="text-2xl font-bold sm:text-3xl">{m.title}</h1>
        <p className="mt-1 max-w-3xl text-sm text-slate-600">{m.subtitle}</p>
      </div>
      <div className="grid gap-6 lg:grid-cols-[1.2fr_1fr]">
        <Card className="space-y-4 p-5" data-testid="converter">
          <h2 className="flex items-center gap-2 text-lg font-bold"><RefreshIcon className="size-5 text-brand-700" />{m.converter}</h2>
          <Field label={m.amount} htmlFor="fx-amount">
            <Input id="fx-amount" dir="ltr" inputMode="decimal" value={amount} onChange={(e) => setAmount(e.target.value.replace(/[^\d.,]/g, "").slice(0, 12))} className="text-lg font-bold" data-testid="fx-amount" />
          </Field>
          <div className="flex flex-wrap gap-2">
            {QUICK.map((q) => <button key={q} type="button" onClick={() => setAmount(String(q))} className={cx("h-8 rounded-full border px-3 text-xs font-semibold", n === q ? "border-brand-700 bg-brand-50" : "border-slate-300")}>{q}</button>)}
          </div>
          <div className="grid items-end gap-3 sm:grid-cols-[1fr_auto_1fr]">
            <Field label={m.from} htmlFor="fx-from"><Select id="fx-from" value={from} onChange={(e) => setFrom(e.target.value)} data-testid="fx-from">{CURRENCIES.map((c) => <option key={c.code} value={c.code}>{name(c.code)}</option>)}</Select></Field>
            <button type="button" onClick={() => { setFrom(to); setTo(from); }} className="mb-1 h-10 rounded-lg px-3 text-sm font-semibold text-brand-700 ring-1 ring-brand-700/25 hover:bg-brand-50" aria-label={m.swap} data-testid="fx-swap">⇄</button>
            <Field label={m.to} htmlFor="fx-to"><Select id="fx-to" value={to} onChange={(e) => setTo(e.target.value)} data-testid="fx-to">{CURRENCIES.map((c) => <option key={c.code} value={c.code}>{name(c.code)}</option>)}</Select></Field>
          </div>
          <div className="rounded-xl bg-brand-50 p-4 text-center">
            <p className="text-sm text-slate-600" dir="ltr">{formatIn(n, from, locale)} =</p>
            <p className="ltr-nums text-3xl font-extrabold text-brand-800" data-testid="fx-result">{formatIn(result, to, locale)}</p>
            <p className="mt-1 text-xs text-slate-500" dir="ltr">{fmt(m.rate, { from, v: String(unit), to })}</p>
          </div>
          <div className="space-y-1 text-xs text-slate-500">
            {fx?.live && fx.updatedAt ? <p data-testid="fx-updated">{fmt(m.updated, { date: new Date(fx.updatedAt).toLocaleString(locale, { timeZone: "Asia/Riyadh" }), source: fx.source })}</p> : <p className="font-semibold text-amber-700" data-testid="fx-builtin">{m.builtIn}</p>}
            <p>{m.offline}</p>
            <p>{m.note}</p>
          </div>
        </Card>
        <Card className="p-5" data-testid="pay-tips">
          <h2 className="flex items-center gap-2 text-lg font-bold"><CardIcon className="size-5 text-brand-700" />{m.payTitle}</h2>
          <ul className="mt-3 space-y-2.5 text-sm text-slate-700">
            {m.payTips.map((x, i) => <li key={i} className="flex gap-2"><CheckIcon className="mt-0.5 size-4 shrink-0 text-brand-600" />{x}</li>)}
          </ul>
        </Card>
      </div>
      <NearbyMoney />
    </div>
  );
}

function NearbyMoney() {
  const { t, locale } = useApp();
  const m = t.money;
  const ar = locale === "ar";
  const [kind, setKind] = useState<"atm" | "exchange">("atm");
  const [city, setCity] = useState("RUH");
  const [me, setMe] = useState<{ lat: number; lng: number } | null>(null);
  const [locating, setLocating] = useState(false);
  const [rows, setRows] = useState<NearbyPlace[] | null>(null);
  const at = me ?? CITY_CENTERS[city];
  useEffect(() => {
    setRows(null);
    fetch(`/api/money/nearby?kind=${kind}&lat=${at.lat}&lng=${at.lng}`).then((r) => (r.ok ? r.json() : { places: [] })).then((d) => setRows(d.places)).catch(() => setRows([]));
  }, [kind, at.lat, at.lng]);
  function locate() {
    if (!navigator.geolocation) return;
    setLocating(true);
    navigator.geolocation.getCurrentPosition((p) => { setMe({ lat: p.coords.latitude, lng: p.coords.longitude }); setLocating(false); }, () => setLocating(false), { timeout: 10_000 });
  }
  return (
    <Card className="space-y-4 p-5" data-testid="money-nearby">
      <h2 className="text-lg font-bold">{m.nearTitle}</h2>
      <div className="flex flex-wrap items-center gap-2">
        {(["atm", "exchange"] as const).map((k) => (
          <button key={k} type="button" aria-pressed={kind === k} onClick={() => setKind(k)} className={cx("h-9 rounded-full border px-4 text-sm font-semibold", kind === k ? "border-brand-700 bg-brand-700 text-white" : "border-slate-300")} data-testid={`money-kind-${k}`}>{m.kinds[k]}</button>
        ))}
        <div className="w-44">
          <Select aria-label={m.city} value={city} onChange={(e) => { setMe(null); setCity(e.target.value); }}>
            {SAUDI_CITIES.filter((c) => CITY_CENTERS[c.code]).map((c) => <option key={c.code} value={c.code}>{ar ? c.ar : c.en}</option>)}
          </Select>
        </div>
        <button type="button" onClick={locate} className="inline-flex h-9 items-center gap-1.5 rounded-lg px-3 text-sm font-semibold text-brand-700 ring-1 ring-brand-700/25">{locating ? <Spinner className="size-4" /> : <LocateIcon className="size-4" />}{m.locate}</button>
      </div>
      {!rows ? <div className="grid h-16 place-items-center text-brand-700"><Spinner className="size-5" /></div> : rows.length === 0 ? <p className="text-sm text-slate-500">{m.none}</p> : (
        <ul className="divide-y divide-slate-100">
          {rows.map((p) => (
            <li key={p.id} className="flex items-center justify-between gap-3 py-2.5 text-sm" data-testid="money-place">
              <div className="min-w-0">
                <p className="font-semibold">{(ar ? p.nameAr ?? p.nameEn : p.nameEn ?? p.nameAr) ?? p.operator ?? m.unnamed[kind]}</p>
                <p className="text-xs text-slate-500">{p.operator && p.operator !== (p.nameAr ?? p.nameEn) ? `${p.operator} · ` : ""}{fmt(m.km, { km: p.km.toLocaleString(locale) })}{me ? "" : ` · ${cityName(city, locale)}`}</p>
              </div>
              <a href={directionsLinks(p).google} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 text-xs font-semibold text-brand-700 hover:underline"><DirectionsIcon className="size-3.5" />{m.directions}</a>
            </li>
          ))}
        </ul>
      )}
      <p className="text-[11px] text-slate-500">{m.osm}</p>
    </Card>
  );
}
