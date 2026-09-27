"use client";

import { useEffect, useMemo, useState } from "react";
import { fmt } from "@/i18n";
import { cityName, SAUDI_CITIES } from "@/lib/data/cities";
import { CITY_CENTERS } from "@/lib/guide/centers";
import type { Place } from "@/lib/guide/types";
import { AIRPORTS, estimateRide } from "@/lib/transport/rides";
import { useApp } from "../app-provider";
import { CarIcon, LocateIcon, MapPinIcon, PlaneIcon, SearchIcon } from "../icons";
import { Card, cx, Input, Select, Spinner } from "../ui";
import { RideEstimateText, RideMenu } from "./ride-menu";

const LANDMARK = new Set(["landmark", "heritage", "museum", "shopping", "entertainment", "park", "beach", "nature", "mosque"]);

/** «Order a car» on the transport page: quick destinations of a city with an estimate from here. */
export function RideFinder({ city: initial }: { city: string }) {
  const { t, locale } = useApp();
  const r = t.rides;
  const ar = locale === "ar";
  const [city, setCity] = useState(CITY_CENTERS[initial] ? initial : "RUH");
  const [places, setPlaces] = useState<Place[] | null>(null);
  const [q, setQ] = useState("");
  const [me, setMe] = useState<{ lat: number; lng: number } | null>(null);
  const [locating, setLocating] = useState(false);
  useEffect(() => {
    if (CITY_CENTERS[initial]) setCity(initial);
  }, [initial]);
  useEffect(() => {
    setPlaces(null);
    fetch(`/api/guide/places?city=${city}`).then((x) => x.json()).then((d) => setPlaces(d.places ?? [])).catch(() => setPlaces([]));
  }, [city]);

  const center = CITY_CENTERS[city];
  const from = me ?? center;
  const name = (p: Place) => (ar ? p.nameAr : p.nameEn);
  const dests = useMemo(() => {
    const out: { key: string; name: string; lat: number; lng: number; icon: "airport" | "center" | "place" }[] = [];
    if (!q.trim()) {
      if (AIRPORTS[city]) out.push({ key: "airport", name: fmt(r.airport, { city: cityName(city, locale) }), ...AIRPORTS[city], icon: "airport" });
      if (me) out.push({ key: "center", name: fmt(r.center, { city: cityName(city, locale) }), lat: center.lat, lng: center.lng, icon: "center" });
    }
    const needle = q.trim().toLowerCase();
    const list = (places ?? [])
      .filter((p) => (needle ? `${p.nameAr} ${p.nameEn}`.toLowerCase().includes(needle) : LANDMARK.has(p.category)))
      .sort((a, b) => Number(b.source === "curated") - Number(a.source === "curated"))
      .slice(0, needle ? 12 : 8);
    for (const p of list) out.push({ key: p.id, name: name(p), lat: p.lat, lng: p.lng, icon: "place" });
    return out;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [places, q, city, me, locale]);

  function locate() {
    if (!navigator.geolocation) return;
    setLocating(true);
    navigator.geolocation.getCurrentPosition(
      (pos) => { setMe({ lat: pos.coords.latitude, lng: pos.coords.longitude }); setLocating(false); },
      () => setLocating(false),
      { timeout: 10_000, maximumAge: 300_000 },
    );
  }

  return (
    <Card className="space-y-4 p-5" data-testid="ride-finder">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="flex items-center gap-2 text-lg font-bold"><CarIcon className="size-5 text-brand-700" />{r.finderTitle}</h2>
          <p className="mt-1 max-w-2xl text-sm text-slate-600">{r.finderIntro}</p>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <div className="w-full sm:w-48">
          <Select value={city} onChange={(e) => setCity(e.target.value)} aria-label={t.transport.inCity} data-testid="ride-city">
            {SAUDI_CITIES.filter((c) => CITY_CENTERS[c.code]).map((c) => <option key={c.code} value={c.code}>{ar ? c.ar : c.en}</option>)}
          </Select>
        </div>
        <div className="relative min-w-0 flex-1 basis-56">
          <SearchIcon className="pointer-events-none absolute start-3 top-1/2 size-4 -translate-y-1/2 text-slate-500" />
          <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder={r.search} aria-label={r.search} className="ps-9" data-testid="ride-search" />
        </div>
        <button type="button" onClick={locate} disabled={locating}
          className={cx("inline-flex h-10 items-center gap-1.5 rounded-lg px-3 text-sm font-semibold", me ? "bg-brand-50 text-brand-800" : "text-brand-700 ring-1 ring-brand-700/25 hover:bg-brand-50")} data-testid="ride-locate">
          {locating ? <Spinner className="size-4" /> : <LocateIcon className="size-4" />}{me ? r.fromMe : r.useMyLocation}
        </button>
      </div>
      <p className="text-xs text-slate-500">{me ? r.fromMeHint : fmt(r.fromCenterHint, { city: cityName(city, locale) })}</p>

      {!places ? (
        <div className="grid h-24 place-items-center text-brand-700"><Spinner className="size-6" /></div>
      ) : dests.length === 0 ? (
        <p className="text-sm text-slate-500">{t.common.noResults}</p>
      ) : (
        <ul className="grid grid-cols-[minmax(0,1fr)] gap-2 md:grid-cols-2">
          {dests.map((d) => {
            const e = estimateRide(from, d);
            const Icon = d.icon === "airport" ? PlaneIcon : MapPinIcon;
            return (
              <li key={d.key} className="flex items-center gap-3 rounded-xl bg-slate-50 p-3" data-testid="ride-dest">
                <Icon className="size-5 shrink-0 text-brand-700" />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-semibold">{d.name}</p>
                  <RideEstimateText e={e} className="text-xs text-slate-500" />
                </div>
                <RideMenu to={{ lat: d.lat, lng: d.lng, name: d.name }} from={me} estimate={e} />
              </li>
            );
          })}
        </ul>
      )}
      <p className="text-[11px] text-slate-500">{r.note}</p>
    </Card>
  );
}
