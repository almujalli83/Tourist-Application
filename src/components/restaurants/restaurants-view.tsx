"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { fmt } from "@/i18n";
import { SAUDI_CITIES } from "@/lib/data/cities";
import { distanceKm } from "@/lib/guide/geo";
import { isOpenNow } from "@/lib/guide/hours";
import { normalizeSearch } from "@/lib/guide/search";
import type { Cuisine, Restaurant } from "@/lib/restaurants/catalog";
import { useApp } from "../app-provider";
import { ClockIcon, LocateIcon, MapPinIcon, SearchIcon } from "../icons";
import { Alert, Badge, Card, cx, Spinner } from "../ui";
import { priceSigns, Stars } from "./shared";

const CUISINE_LIST: Cuisine[] = ["saudi", "hejazi", "seafood", "italian", "japanese", "lebanese", "indian", "turkish", "international", "cafe"];
const selectCls = "h-11 rounded-lg border border-slate-300 bg-white px-3 text-sm focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-500/30";

/** Restaurants with filters, near me and table booking. */
export function RestaurantsView() {
  const { t, locale, money } = useApp();
  const rs = t.restaurants;
  const g = t.guide;
  const ar = locale === "ar";
  const [list, setList] = useState<Restaurant[] | null>(null);
  const [city, setCity] = useState("");
  const [cuisine, setCuisine] = useState("");
  const [price, setPrice] = useState("");
  const [rating, setRating] = useState("");
  const [booking, setBooking] = useState<"any" | "free" | "fee">("any");
  const [q, setQ] = useState("");
  const [openOnly, setOpenOnly] = useState(false);
  const [loc, setLoc] = useState<{ lat: number; lng: number } | null>(null);
  const [locState, setLocState] = useState<"idle" | "locating" | "denied">("idle");
  const now = useMemo(() => new Date(), []);

  useEffect(() => {
    const c = new URLSearchParams(window.location.search).get("city");
    if (c) setCity(c.toUpperCase());
    fetch("/api/restaurants").then((r) => r.json()).then((d) => setList(d.restaurants)).catch(() => setList([]));
  }, []);

  function locate() {
    if (loc) {
      setLoc(null);
      return;
    }
    if (!navigator.geolocation) {
      setLocState("denied");
      return;
    }
    setLocState("locating");
    navigator.geolocation.getCurrentPosition(
      (p) => { setLoc({ lat: p.coords.latitude, lng: p.coords.longitude }); setLocState("idle"); },
      () => setLocState("denied"),
      { enableHighAccuracy: true, timeout: 15_000, maximumAge: 60_000 },
    );
  }

  const cities = useMemo(() => [...new Set((list ?? []).map((r) => r.city))], [list]);
  const results = useMemo(() => {
    if (!list) return null;
    const needle = normalizeSearch(q);
    const rows = list
      .filter((r) => !city || r.city === city)
      .filter((r) => !cuisine || r.cuisine === cuisine)
      .filter((r) => !price || r.priceLevel === Number(price))
      .filter((r) => !rating || r.rating >= Number(rating))
      .filter((r) => booking === "any" || (booking === "free" ? r.policy.feePerGuestSAR === 0 : r.policy.feePerGuestSAR > 0))
      .filter((r) => !openOnly || isOpenNow(r, now) === true)
      .filter((r) => {
        if (!needle) return true;
        const hay = normalizeSearch([r.nameAr, r.nameEn, rs.cuisines[r.cuisine], r.addressAr, r.addressEn].join(" "));
        return needle.split(" ").every((w) => hay.includes(w));
      })
      .map((r) => ({ r, km: loc ? distanceKm(loc, r) : null }));
    return loc ? rows.sort((a, b) => a.km! - b.km!) : rows.sort((a, b) => b.r.rating - a.r.rating);
  }, [list, city, cuisine, price, rating, booking, openOnly, q, loc, now, rs.cuisines]);

  const cityName = (c: string) => {
    const x = SAUDI_CITIES.find((y) => y.code === c);
    return x ? (ar ? x.ar : x.en) : c;
  };

  if (!list) return <div className="grid min-h-[40vh] place-items-center text-brand-700"><Spinner className="size-8" /></div>;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold sm:text-3xl">{rs.title}</h1>
        <p className="mt-1 max-w-3xl text-sm text-slate-600">{rs.subtitle}</p>
      </div>

      <Card className="space-y-3 p-4">
        <div className="relative">
          <SearchIcon className="pointer-events-none absolute start-3 top-1/2 size-4 -translate-y-1/2 text-slate-400" />
          <input type="search" value={q} onChange={(e) => setQ(e.target.value)} placeholder={rs.search} aria-label={rs.search}
            className="h-11 w-full rounded-lg border border-slate-300 bg-white ps-9 pe-3 text-sm focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-500/30" />
        </div>
        <div className="grid gap-2 sm:grid-cols-3 lg:grid-cols-5">
          <select aria-label={rs.city} value={city} onChange={(e) => setCity(e.target.value)} className={selectCls}>
            <option value="">{rs.allCities}</option>
            {cities.map((c) => <option key={c} value={c}>{cityName(c)}</option>)}
          </select>
          <select aria-label={rs.cuisine} value={cuisine} onChange={(e) => setCuisine(e.target.value)} className={selectCls}>
            <option value="">{rs.anyCuisine}</option>
            {CUISINE_LIST.map((c) => <option key={c} value={c}>{rs.cuisines[c]}</option>)}
          </select>
          <select aria-label={rs.price} value={price} onChange={(e) => setPrice(e.target.value)} className={selectCls}>
            <option value="">{rs.anyPrice}</option>
            {[1, 2, 3, 4].map((n) => <option key={n} value={n}>{priceSigns(n)} · {g.priceLevels[n]}</option>)}
          </select>
          <select aria-label={rs.rating} value={rating} onChange={(e) => setRating(e.target.value)} className={selectCls}>
            <option value="">{rs.anyRating}</option>
            {["4", "4.5"].map((n) => <option key={n} value={n}>{fmt(rs.ratingMin, { n })}</option>)}
          </select>
          <select aria-label={rs.bookingType.any} value={booking} onChange={(e) => setBooking(e.target.value as typeof booking)} className={selectCls}>
            {(["any", "free", "fee"] as const).map((k) => <option key={k} value={k}>{rs.bookingType[k]}</option>)}
          </select>
        </div>
        <div className="flex flex-wrap gap-2">
          <Chip active={openOnly} onClick={() => setOpenOnly(!openOnly)}><ClockIcon className="size-3.5" />{g.openNow}</Chip>
          <Chip active={!!loc} onClick={locate}>{locState === "locating" ? <Spinner className="size-3.5" /> : <LocateIcon className="size-3.5" />}{g.nearMe}</Chip>
        </div>
        {locState === "denied" && <Alert tone="warning" className="text-xs">{g.locationDenied}</Alert>}
      </Card>

      {results && results.length === 0 ? (
        <Card className="p-10 text-center text-sm text-slate-500">{rs.noResults}</Card>
      ) : (
        <>
          <p className="text-xs font-medium text-slate-500">{fmt(rs.results, { n: results?.length ?? 0 })}</p>
          <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {results?.map(({ r, km }) => {
              const open = isOpenNow(r, now);
              return (
                <li key={r.id}>
                  <Card className="flex h-full flex-col p-5" data-testid="restaurant-card">
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <h2 className="font-bold text-ink">{ar ? r.nameAr : r.nameEn}</h2>
                        <p className="mt-0.5 text-xs text-slate-500">{rs.cuisines[r.cuisine]} · {priceSigns(r.priceLevel)} · {cityName(r.city)}</p>
                      </div>
                      {open !== null && <Badge tone={open ? "brand" : "red"}>{open ? g.open : g.closed}</Badge>}
                    </div>
                    <div className="mt-2 flex flex-wrap items-center gap-2 text-xs text-slate-500">
                      <Stars rating={r.rating} /><span>({fmt(rs.reviews, { n: r.reviews })})</span>
                      {km !== null && <span className="font-semibold text-brand-700">· {fmt(g.distance, { d: km.toFixed(1) })}</span>}
                    </div>
                    <p className="mt-2 line-clamp-2 text-sm text-slate-600">{ar ? r.descriptionAr : r.descriptionEn}</p>
                    <div className="mt-3">
                      <Badge tone={r.policy.feePerGuestSAR ? "gold" : "brand"}>
                        {r.policy.feePerGuestSAR ? fmt(rs.feeBooking, { fee: money(r.policy.feePerGuestSAR) }) : rs.freeBooking}
                      </Badge>
                    </div>
                    <div className="mt-auto flex items-center justify-between gap-2 pt-4">
                      <Link href={`/${locale}/guide?city=${r.city}&place=${encodeURIComponent(`restaurant:${r.id}`)}`} className="inline-flex items-center gap-1 text-xs font-semibold text-brand-700 hover:underline">
                        <MapPinIcon className="size-3.5" />{rs.showOnMap}
                      </Link>
                      <Link href={`/${locale}/restaurants/${r.id}`} className="inline-flex h-10 items-center rounded-lg bg-brand-700 px-4 text-sm font-semibold text-white hover:bg-brand-800">{rs.details.book}</Link>
                    </div>
                  </Card>
                </li>
              );
            })}
          </ul>
        </>
      )}
    </div>
  );
}

function Chip({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button type="button" onClick={onClick} aria-pressed={active}
      className={cx("inline-flex h-9 items-center gap-1.5 rounded-full border px-3.5 text-xs font-semibold", active ? "border-brand-700 bg-brand-700 text-white" : "border-slate-300 bg-white text-slate-700 hover:border-brand-500")}>
      {children}
    </button>
  );
}
