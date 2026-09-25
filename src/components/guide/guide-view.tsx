"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { fmt } from "@/i18n";
import { SAUDI_CITIES } from "@/lib/data/cities";
import { directionsLinks, distanceKm } from "@/lib/guide/geo";
import { isOpenNow, ksaClock } from "@/lib/guide/hours";
import type { PublicPlace } from "@/lib/guide/repo";
import { matchesQuery } from "@/lib/guide/search";
import { fmtKsa } from "@/lib/events/format";
import { CITY_CENTERS } from "@/lib/guide/centers";
import { PLACE_CATEGORIES, type OpeningSlot, type PlaceTag } from "@/lib/guide/types";
import { useApp } from "../app-provider";
import { ChevronIcon, ClockIcon, DirectionsIcon, GlobeIcon, HeartIcon, LocateIcon, MapPinIcon, PhoneIcon, SearchIcon, ShareIcon, TicketIcon, XIcon } from "../icons";
import { Alert, Badge, Button, cx, Spinner } from "../ui";
import { CATEGORY_COLORS, GuideMap, type GuideCategory } from "./guide-map";

/** A guide place, or an event on sale shown on the map (category "event"). */
type GuidePlace = Omit<PublicPlace, "category"> & { category: GuideCategory; eventId?: string; nextStart?: string; minPriceSAR?: number; trainStation?: string; transit?: boolean; restaurantId?: string };
const GUIDE_CATEGORIES: GuideCategory[] = ["event", "station", ...PLACE_CATEGORIES];

interface StationsData {
  stations: { code: string; nameAr: string; nameEn: string; city: string; lat: number; lng: number; line: string }[];
  lines: { id: string; nameAr: string; nameEn: string }[];
  metro: { code: string; nameAr: string; nameEn: string; lat: number; lng: number; linesAr: string; linesEn: string }[];
}

interface RestaurantSummary {
  id: string; city: string; nameAr: string; nameEn: string; descriptionAr: string; descriptionEn: string; addressAr: string; addressEn: string;
  lat: number; lng: number; priceLevel: number; hours: OpeningSlot[]; tags: PlaceTag[]; cuisine: string;
}

function restaurantPlaces(list: RestaurantSummary[], city: string, cuisines: Record<string, string>, cuisinesEn: Record<string, string>): GuidePlace[] {
  return list.filter((r) => r.city === city).map((r) => ({
    id: `restaurant:${r.id}`, restaurantId: r.id, city, category: "restaurant" as const, nameAr: r.nameAr, nameEn: r.nameEn,
    descriptionAr: r.descriptionAr, descriptionEn: r.descriptionEn, addressAr: r.addressAr, addressEn: r.addressEn,
    lat: r.lat, lng: r.lng, priceLevel: r.priceLevel, hours: r.hours, tags: r.tags, cuisineAr: cuisines[r.cuisine], cuisineEn: cuisinesEn[r.cuisine],
    source: "official" as const, updatedAt: "",
  }));
}

function stationPlaces(d: StationsData, city: string, g: { trainStation: string; metroStation: string }): GuidePlace[] {
  const base = { city, category: "station" as const, tags: [], source: "official" as const, updatedAt: "", transit: true };
  const trains = d.stations.filter((s) => s.city === city).map((s): GuidePlace => {
    const line = d.lines.find((l) => l.id === s.line);
    return { ...base, id: `station:${s.code}`, nameAr: s.nameAr, nameEn: s.nameEn, descriptionAr: `${g.trainStation} — ${line?.nameAr ?? ""}`, descriptionEn: `${g.trainStation} — ${line?.nameEn ?? ""}`, lat: s.lat, lng: s.lng, trainStation: s.code };
  });
  const metro = city === "RUH" ? d.metro.map((m): GuidePlace => ({ ...base, id: `station:${m.code}`, nameAr: m.nameAr, nameEn: m.nameEn, descriptionAr: `${g.metroStation} — ${m.linesAr}`, descriptionEn: `${g.metroStation} — ${m.linesEn}`, lat: m.lat, lng: m.lng })) : [];
  return [...trains, ...metro];
}

interface EventSummary {
  id: string; city: string; titleAr: string; titleEn: string; descriptionAr: string; descriptionEn: string;
  venueAr: string; venueEn: string; lat: number; lng: number; durationMins: number; minPriceSAR: number; sessions: { start: string }[];
}

const eventPlace = (e: EventSummary): GuidePlace => ({
  id: `event:${e.id}`, eventId: e.id, city: e.city, category: "event", nameAr: e.titleAr, nameEn: e.titleEn,
  descriptionAr: e.descriptionAr, descriptionEn: e.descriptionEn, addressAr: e.venueAr, addressEn: e.venueEn,
  lat: e.lat, lng: e.lng, tags: [], source: "official", updatedAt: "", durationMins: e.durationMins,
  nextStart: e.sessions[0]?.start, minPriceSAR: e.minPriceSAR,
});

const LOCAL_FAVORITES = "guide:favorites";
const FILTER_TAGS: PlaceTag[] = ["family", "kids", "wheelchair", "free"];
const FAR_KM = 80;

const readLocal = (): string[] => {
  try {
    const v = JSON.parse(localStorage.getItem(LOCAL_FAVORITES) ?? "[]");
    return Array.isArray(v) ? v.filter((x) => typeof x === "string") : [];
  } catch {
    return [];
  }
};
const writeLocal = (ids: string[]) => {
  try {
    localStorage.setItem(LOCAL_FAVORITES, JSON.stringify(ids));
  } catch {
    /* storage unavailable */
  }
};

/** Interactive map & guide of destinations and restaurants. */
export function GuideView() {
  const { t, locale, user } = useApp();
  const g = t.guide;
  const ar = locale === "ar";
  const name = (p: { nameAr: string; nameEn: string }) => (ar ? p.nameAr : p.nameEn);

  const [counts, setCounts] = useState<Record<string, number>>({});
  const [tripCities, setTripCities] = useState<string[]>([]);
  const [city, setCity] = useState<string | null>(null);
  const [places, setPlaces] = useState<GuidePlace[] | null>(null);
  const [loadError, setLoadError] = useState(false);
  const [tab, setTab] = useState<"explore" | "favorites">("explore");
  const [category, setCategory] = useState<GuideCategory | "all">("all");
  const [q, setQ] = useState("");
  const [openOnly, setOpenOnly] = useState(false);
  const [tags, setTags] = useState<PlaceTag[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [view, setView] = useState<"list" | "map">("list");
  const [favIds, setFavIds] = useState<string[]>([]);
  const [favPlaces, setFavPlaces] = useState<GuidePlace[] | null>(null);
  const [userLoc, setUserLoc] = useState<{ lat: number; lng: number } | null>(null);
  const [locState, setLocState] = useState<"idle" | "locating" | "denied">("idle");
  const [copied, setCopied] = useState(false);
  const [now, setNow] = useState(() => new Date());
  const [events, setEvents] = useState<EventSummary[]>([]);

  useEffect(() => {
    fetch("/api/events", { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : Promise.reject()))
      .then((d: { events: EventSummary[] }) => setEvents(d.events))
      .catch(() => setEvents([]));
  }, []);
  const [stationsData, setStationsData] = useState<StationsData | null>(null);
  const [restaurants, setRestaurants] = useState<RestaurantSummary[]>([]);
  useEffect(() => {
    fetch("/api/restaurants")
      .then((r) => (r.ok ? r.json() : Promise.reject()))
      .then((d: { restaurants: RestaurantSummary[] }) => setRestaurants(d.restaurants))
      .catch(() => setRestaurants([]));
  }, []);
  useEffect(() => {
    fetch("/api/trains/stations")
      .then((r) => (r.ok ? r.json() : Promise.reject()))
      .then(setStationsData)
      .catch(() => setStationsData(null));
  }, []);
  const cityEvents = useMemo(
    () => [
      ...events.filter((e) => e.city === city).map(eventPlace),
      ...(stationsData && city ? stationPlaces(stationsData, city, g) : []),
      ...(city ? restaurantPlaces(restaurants, city, t.restaurants.cuisines, t.restaurants.cuisines) : []),
    ],
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [events, city, stationsData, restaurants],
  );

  useEffect(() => {
    const i = setInterval(() => setNow(new Date()), 60_000);
    return () => clearInterval(i);
  }, []);

  // Cities, and the city / place from the link.
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const linkCity = params.get("city")?.toUpperCase();
    const linkPlace = params.get("place");
    if (linkPlace) setSelectedId(linkPlace);
    fetch("/api/guide/cities", { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : Promise.reject()))
      .then((d: { counts: Record<string, number>; tripCities: string[] }) => {
        setCounts(d.counts);
        setTripCities(d.tripCities);
        const valid = (c?: string) => !!c && !!CITY_CENTERS[c];
        setCity(valid(linkCity) ? linkCity! : d.tripCities.find(valid) ?? "RUH");
      })
      .catch(() => {
        setLoadError(true);
        setCity(linkCity && CITY_CENTERS[linkCity] ? linkCity : "RUH");
      });
  }, []);

  // Places of the city.
  useEffect(() => {
    if (!city) return;
    setPlaces(null);
    fetch(`/api/guide/places?city=${city}`, { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : Promise.reject()))
      .then((d: { places: PublicPlace[] }) => setPlaces(d.places))
      .catch(() => {
        setLoadError(true);
        setPlaces([]);
      });
  }, [city]);

  // Favourites: in the account when signed in (device favourites are moved there), else on the device.
  useEffect(() => {
    if (!user) {
      setFavIds(readLocal());
      return;
    }
    const local = readLocal();
    const req = local.length
      ? fetch("/api/guide/favorites", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ add: local }) })
      : fetch("/api/guide/favorites", { cache: "no-store" });
    req
      .then((r) => (r.ok ? r.json() : Promise.reject()))
      .then((d: { ids: string[] }) => {
        setFavIds(d.ids);
        if (local.length) writeLocal([]);
      })
      .catch(() => setFavIds(local));
  }, [user]);

  // Favourite places (all cities) when the tab is open.
  useEffect(() => {
    if (tab !== "favorites") return;
    if (!favIds.length) {
      setFavPlaces([]);
      return;
    }
    fetch(`/api/guide/places?ids=${favIds.map(encodeURIComponent).join(",")}`, { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : Promise.reject()))
      .then((d: { places: PublicPlace[] }) => setFavPlaces(d.places))
      .catch(() => setFavPlaces([]));
  }, [tab, favIds]);

  // Keep the link shareable: ?city=…&place=…
  useEffect(() => {
    if (!city) return;
    const u = new URL(window.location.href);
    u.searchParams.set("city", city);
    if (selectedId) u.searchParams.set("place", selectedId);
    else u.searchParams.delete("place");
    window.history.replaceState(null, "", u);
  }, [city, selectedId]);

  const toggleFavorite = useCallback(
    (id: string) => {
      const has = favIds.includes(id);
      const next = has ? favIds.filter((i) => i !== id) : [...favIds, id];
      setFavIds(next);
      if (!user) {
        writeLocal(next);
        return;
      }
      fetch("/api/guide/favorites", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(has ? { remove: [id] } : { add: [id] }),
      })
        .then((r) => (r.ok ? r.json() : Promise.reject()))
        .then((d: { ids: string[] }) => setFavIds(d.ids))
        .catch(() => setFavIds(favIds));
    },
    [favIds, user],
  );

  function locate() {
    if (!navigator.geolocation) {
      setLocState("denied");
      return;
    }
    setLocState("locating");
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setUserLoc({ lat: pos.coords.latitude, lng: pos.coords.longitude });
        setLocState("idle");
      },
      () => setLocState("denied"),
      { enableHighAccuracy: true, timeout: 15_000, maximumAge: 60_000 },
    );
  }

  const source = useMemo(() => (tab === "favorites" ? favPlaces : places && [...places, ...cityEvents]), [tab, favPlaces, places, cityEvents]);
  const results = useMemo(() => {
    if (!source) return null;
    const list = source.filter(
      (p) =>
        (category === "all" || p.category === category) &&
        (!openOnly || isOpenNow(p, now) === true) &&
        tags.every((tg) => p.tags.includes(tg)) &&
        matchesQuery(p, q),
    );
    if (!userLoc) return list.map((p) => ({ p, km: null as number | null }));
    return list.map((p) => ({ p, km: distanceKm(userLoc, p) })).sort((a, b) => a.km - b.km);
  }, [source, category, openOnly, tags, q, userLoc, now]);

  const selected = useMemo(
    () => (selectedId ? [...(places ?? []), ...cityEvents, ...(favPlaces ?? [])].find((p) => p.id === selectedId) ?? null : null),
    [selectedId, places, favPlaces, cityEvents],
  );

  const catCounts = useMemo(() => {
    const c: Partial<Record<GuideCategory, number>> = {};
    for (const p of source ?? []) c[p.category] = (c[p.category] ?? 0) + 1;
    return c;
  }, [source]);

  const points = useMemo(
    () => (results ?? []).map(({ p }) => ({ id: p.id, lat: p.lat, lng: p.lng, category: p.category, label: name(p) })),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [results, locale],
  );

  const cityInfo = SAUDI_CITIES.find((c) => c.code === city);
  const center = CITY_CENTERS[city ?? "RUH"] ?? CITY_CENTERS.RUH;
  const farFromCity = userLoc && city && distanceKm(userLoc, center) > FAR_KM;
  const cityOptions = SAUDI_CITIES.filter((c) => (counts[c.code] ?? 0) > 0 || tripCities.includes(c.code) || c.code === city);
  const fitKey = [tab, city, category, openOnly, tags.join(), q, favPlaces?.length ?? 0, places?.length ?? 0, cityEvents.length, view].join("|");

  async function share(p: GuidePlace) {
    const url = `${window.location.origin}/${locale}/guide?city=${p.city}&place=${encodeURIComponent(p.id)}`;
    if (navigator.share) {
      try {
        await navigator.share({ title: name(p), url });
        return;
      } catch {
        /* cancelled — fall back to copying */
      }
    }
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      /* clipboard unavailable */
    }
  }

  function select(id: string, fromMap = false) {
    setSelectedId(id);
    if (!fromMap) setView("list");
  }

  const openBadge = (p: GuidePlace) => {
    const o = isOpenNow(p, now);
    if (o === null) return null;
    return <Badge tone={o ? "brand" : "red"}>{p.open24h ? g.open24h : o ? g.open : g.closed}</Badge>;
  };

  const favButton = (p: GuidePlace, big = false) => {
    if (p.eventId || p.transit || p.restaurantId) return null; // bookable items are not saved as favourites
    const on = favIds.includes(p.id);
    return (
      <button
        type="button"
        onClick={(e) => {
          e.stopPropagation();
          toggleFavorite(p.id);
        }}
        aria-pressed={on}
        aria-label={on ? g.removeFavorite : g.addFavorite}
        title={on ? g.removeFavorite : g.addFavorite}
        className={cx("grid shrink-0 place-items-center rounded-full transition-colors hover:bg-red-50", big ? "size-10" : "size-8", on ? "text-red-600" : "text-slate-400")}
      >
        <HeartIcon className={big ? "size-6" : "size-5"} fill={on ? "currentColor" : "none"} />
      </button>
    );
  };

  /* ---------------------------------------------------------------- UI */

  const header = (
    <div className="space-y-3 border-b border-slate-200 p-4">
      <div>
        <h1 className="text-lg font-bold text-ink">{g.title}</h1>
        <p className="mt-0.5 text-xs text-slate-500">{g.subtitle}</p>
      </div>
      <div className="grid grid-cols-2 gap-1 rounded-lg bg-slate-100 p-1" role="tablist">
        {(["explore", "favorites"] as const).map((k) => (
          <button
            key={k}
            role="tab"
            aria-selected={tab === k}
            onClick={() => {
              setTab(k);
              setSelectedId(null);
            }}
            className={cx("h-9 rounded-md text-sm font-semibold transition", tab === k ? "bg-white text-brand-800 shadow-sm" : "text-slate-600 hover:text-ink")}
          >
            {k === "favorites" ? `${g.tabs.favorites}${favIds.length ? ` (${favIds.length})` : ""}` : g.tabs.explore}
          </button>
        ))}
      </div>
      {tab === "explore" && (
        <div>
          <label htmlFor="guide-city" className="sr-only">{g.city}</label>
          <select
            id="guide-city"
            value={city ?? ""}
            onChange={(e) => {
              setCity(e.target.value);
              setSelectedId(null);
              setCategory("all");
            }}
            className="h-11 w-full rounded-lg border border-slate-300 bg-white px-3 text-sm font-semibold text-ink focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-500/30"
          >
            {tripCities.length > 0 && (
              <optgroup label={g.yourTrip}>
                {tripCities.map((c) => {
                  const ci = SAUDI_CITIES.find((x) => x.code === c);
                  return ci ? <option key={`t-${c}`} value={c}>{`${ar ? ci.ar : ci.en} · ${fmt(g.placesCount, { n: counts[c] ?? 0 })}`}</option> : null;
                })}
              </optgroup>
            )}
            <optgroup label={g.allCities}>
              {cityOptions.filter((c) => !tripCities.includes(c.code)).map((c) => (
                <option key={c.code} value={c.code}>{`${ar ? c.ar : c.en} · ${fmt(g.placesCount, { n: counts[c.code] ?? 0 })}`}</option>
              ))}
            </optgroup>
          </select>
          {cityInfo && <p className="mt-1.5 text-xs text-slate-500">{ar ? cityInfo.descriptionAr : cityInfo.descriptionEn}</p>}
        </div>
      )}
      <div className="relative">
        <SearchIcon className="pointer-events-none absolute start-3 top-1/2 size-4 -translate-y-1/2 text-slate-400" />
        <input
          type="search"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder={g.search}
          aria-label={g.search}
          className="h-10 w-full rounded-lg border border-slate-300 bg-white ps-9 pe-3 text-sm focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-500/30"
        />
      </div>
      <div className="-mx-4 flex gap-1.5 overflow-x-auto px-4 pb-1" aria-label={g.filters}>
        <Chip active={category === "all"} onClick={() => setCategory("all")}>{g.all}</Chip>
        {GUIDE_CATEGORIES.filter((c) => catCounts[c]).map((c) => (
          <Chip key={c} active={category === c} onClick={() => setCategory(category === c ? "all" : c)} color={CATEGORY_COLORS[c]}>
            {g.categories[c]} <span className="opacity-60">{catCounts[c]}</span>
          </Chip>
        ))}
      </div>
      <div className="flex flex-wrap gap-1.5">
        <Chip active={openOnly} onClick={() => setOpenOnly(!openOnly)}>
          <ClockIcon className="size-3.5" /> {g.openNow}
        </Chip>
        <Chip active={!!userLoc} onClick={() => (userLoc ? setUserLoc(null) : locate())}>
          {locState === "locating" ? <Spinner className="size-3.5" /> : <LocateIcon className="size-3.5" />} {g.nearMe}
        </Chip>
        {FILTER_TAGS.map((tg) => (
          <Chip key={tg} active={tags.includes(tg)} onClick={() => setTags(tags.includes(tg) ? tags.filter((x) => x !== tg) : [...tags, tg])}>
            {g.tags[tg]}
          </Chip>
        ))}
      </div>
      {locState === "denied" && <Alert tone="warning" className="text-xs">{g.locationDenied}</Alert>}
      {farFromCity && tab === "explore" && cityInfo && <p className="text-xs text-amber-700">{fmt(g.farFromCity, { city: ar ? cityInfo.ar : cityInfo.en })}</p>}
      {tab === "favorites" && !user && <p className="text-xs text-slate-500">{g.favoritesGuest}</p>}
    </div>
  );

  const list = (
    <div>
      {results === null ? (
        <div className="grid place-items-center py-16"><Spinner className="size-6 text-brand-600" /></div>
      ) : results.length === 0 ? (
        <p className="p-6 text-center text-sm text-slate-500">{tab === "favorites" && !favIds.length ? g.noFavorites : g.noResults}</p>
      ) : (
        <>
          <p className="px-4 pt-3 text-xs font-medium text-slate-500">{fmt(g.results, { n: results.length })}</p>
          <ul className="divide-y divide-slate-100">
            {results.map(({ p, km }) => (
              <li key={p.id}>
                <div
                  role="button"
                  tabIndex={0}
                  onClick={() => select(p.id)}
                  onKeyDown={(e) => (e.key === "Enter" || e.key === " ") && (e.preventDefault(), select(p.id))}
                  className="flex cursor-pointer gap-3 px-4 py-3 transition-colors hover:bg-slate-50 focus-visible:bg-brand-50 focus-visible:outline-none"
                  data-testid="guide-place"
                >
                  <span className="mt-1.5 size-2.5 shrink-0 rounded-full" style={{ background: CATEGORY_COLORS[p.category] }} />
                  <div className="min-w-0 flex-1">
                    <p className="font-semibold text-ink">{name(p)}</p>
                    <div className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-slate-500">
                      <span>{g.categories[p.category]}</span>
                      {p.cuisineEn && <span>· {ar ? p.cuisineAr || p.cuisineEn : p.cuisineEn}</span>}
                      {km !== null && <span className="font-medium text-brand-700">· {fmt(g.distance, { d: km.toFixed(1) })}</span>}
                      {openBadge(p)}
                    </div>
                    {(ar ? p.descriptionAr : p.descriptionEn) && <p className="mt-1 line-clamp-2 text-xs text-slate-600">{ar ? p.descriptionAr : p.descriptionEn}</p>}
                  </div>
                  {favButton(p)}
                </div>
              </li>
            ))}
          </ul>
        </>
      )}
    </div>
  );

  const detail = selected && (
    <PlaceDetail
      place={selected}
      km={userLoc ? distanceKm(userLoc, selected) : null}
      onBack={() => setSelectedId(null)}
      onShowMap={() => setView("map")}
      onShare={() => share(selected)}
      copied={copied}
      openBadge={openBadge(selected)}
      favButton={favButton(selected, true)}
      now={now}
    />
  );

  const mobileCard = selected && view === "map" && (
    <div className="absolute inset-x-3 bottom-20 z-[500] rounded-2xl bg-white p-4 shadow-xl md:hidden">
      <div className="flex items-start gap-3">
        <div className="min-w-0 flex-1">
          <p className="font-bold text-ink">{name(selected)}</p>
          <div className="mt-1 flex flex-wrap items-center gap-2 text-xs text-slate-500">
            <span>{g.categories[selected.category]}</span>
            {openBadge(selected)}
          </div>
        </div>
        {favButton(selected)}
      </div>
      <Button size="sm" variant="secondary" className="mt-3 w-full" onClick={() => setView("list")}>{g.details}</Button>
    </div>
  );

  return (
    <div className="relative flex h-[calc(100dvh-4.25rem)] flex-col md:flex-row">
      <aside className={cx("flex min-h-0 w-full flex-col border-e border-slate-200 bg-white md:w-[420px] md:shrink-0", view === "map" && "hidden md:flex")}>
        <div className="min-h-0 flex-1 overflow-y-auto">
          {detail || (
            <>
              {header}
              {loadError && <Alert tone="error" className="m-4">{g.loadError}</Alert>}
              {list}
            </>
          )}
        </div>
      </aside>
      <div className={cx("relative isolate min-h-0 flex-1", view === "list" && "hidden md:block")}>
        {city && (
          <GuideMap
            className="absolute inset-0"
            points={points}
            selectedId={selectedId}
            onSelect={(id) => select(id, true)}
            center={center}
            fitKey={fitKey}
            userLocation={userLoc}
            unavailableText={g.mapUnavailable}
          />
        )}
        {mobileCard}
      </div>
      <div className="pointer-events-none fixed inset-x-0 bottom-5 z-[600] flex justify-center md:hidden">
        <Button className="pointer-events-auto rounded-full shadow-lg" onClick={() => setView(view === "list" ? "map" : "list")}>
          {view === "list" ? <><MapPinIcon className="size-4" /> {g.map}</> : g.list}
        </Button>
      </div>
    </div>
  );
}

function Chip({ active, onClick, color, children }: { active: boolean; onClick: () => void; color?: string; children: React.ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={cx(
        "inline-flex h-8 shrink-0 items-center gap-1.5 whitespace-nowrap rounded-full border px-3 text-xs font-semibold transition-colors",
        active ? "border-brand-700 bg-brand-700 text-white" : "border-slate-300 bg-white text-slate-700 hover:border-brand-500",
      )}
    >
      {color && !active && <span className="size-2 rounded-full" style={{ background: color }} />}
      {children}
    </button>
  );
}

function PlaceDetail({ place: p, km, onBack, onShowMap, onShare, copied, openBadge, favButton, now }: {
  place: GuidePlace; km: number | null; onBack: () => void; onShowMap: () => void; onShare: () => void; copied: boolean;
  openBadge: React.ReactNode; favButton: React.ReactNode; now: Date;
}) {
  const { t, locale, money } = useApp();
  const g = t.guide;
  const ar = locale === "ar";
  const links = directionsLinks(p);
  const today = ksaClock(now).day;
  const daysLabel = (s: OpeningSlot) => (s.days.length === 7 ? g.everyDay : s.days.map((d) => g.days[d]).join(ar ? "، " : ", "));
  const duration = p.durationMins ? (p.durationMins >= 60 ? fmt(g.hoursShort, { n: Math.round((p.durationMins / 60) * 10) / 10 }) : fmt(g.minutes, { n: p.durationMins })) : null;
  const description = ar ? p.descriptionAr : p.descriptionEn;
  const address = ar ? p.addressAr || p.addressEn : p.addressEn || p.addressAr;
  const cuisine = ar ? p.cuisineAr || p.cuisineEn : p.cuisineEn || p.cuisineAr;

  return (
    <article className="p-4" data-testid="guide-detail">
      <div className="flex items-center justify-between gap-2">
        <button type="button" onClick={onBack} className="inline-flex items-center gap-1 text-sm font-semibold text-brand-700 hover:text-brand-900">
          <ChevronIcon className="size-4 rotate-180 rtl:rotate-0" /> {g.tabs.explore}
        </button>
        <button type="button" onClick={onBack} aria-label={g.close} className="grid size-8 place-items-center rounded-full text-slate-500 hover:bg-slate-100">
          <XIcon className="size-4" />
        </button>
      </div>
      <div className="mt-3 flex items-start gap-3">
        <div className="min-w-0 flex-1">
          <p className="flex items-center gap-1.5 text-xs font-semibold" style={{ color: CATEGORY_COLORS[p.category] }}>
            <span className="size-2 rounded-full" style={{ background: CATEGORY_COLORS[p.category] }} /> {g.categories[p.category]}
          </p>
          <h2 className="mt-1 text-xl font-bold text-ink">{ar ? p.nameAr : p.nameEn}</h2>
          <p className="text-sm text-slate-500">{ar ? p.nameEn : p.nameAr}</p>
        </div>
        {favButton}
      </div>
      <div className="mt-3 flex flex-wrap items-center gap-2">
        {openBadge}
        {km !== null && <Badge tone="gold">{fmt(g.distance, { d: km.toFixed(1) })}</Badge>}
        {!p.eventId && !p.transit && !p.restaurantId && <Badge>{g.source[p.source]}</Badge>}
      </div>
      {description && <p className="mt-4 text-sm leading-7 text-slate-700">{description}</p>}

      <div className="mt-4 grid grid-cols-2 gap-2">
        <a href={links.google} target="_blank" rel="noopener noreferrer" className="inline-flex h-10 items-center justify-center gap-2 rounded-lg bg-brand-700 text-sm font-semibold text-white hover:bg-brand-800">
          <DirectionsIcon className="size-4" /> {g.googleMaps}
        </a>
        <a href={links.apple} target="_blank" rel="noopener noreferrer" className="inline-flex h-10 items-center justify-center gap-2 rounded-lg bg-white text-sm font-semibold text-brand-800 ring-1 ring-inset ring-brand-700/25 hover:bg-brand-50">
          <DirectionsIcon className="size-4" /> {g.appleMaps}
        </a>
        <Button variant="secondary" size="sm" onClick={onShare} className="md:col-span-2">
          <ShareIcon className="size-4" /> {copied ? g.copied : g.share}
        </Button>
        <Button variant="secondary" size="sm" onClick={onShowMap} className="md:hidden">
          <MapPinIcon className="size-4" /> {g.showOnMap}
        </Button>
      </div>

      {p.eventId && (
        <div className="mt-4 rounded-xl border border-pink-200 bg-pink-50 p-3 text-sm">
          {p.nextStart && <p><span className="font-semibold">{g.nextSession}:</span> {fmtKsa(p.nextStart, locale, { weekday: "long", day: "numeric", month: "long", hour: "2-digit", minute: "2-digit" })}</p>}
          {p.minPriceSAR !== undefined && <p className="mt-1 text-slate-600">{fmt(t.events.from, { price: money(p.minPriceSAR) })}</p>}
          <Link href={`/${locale}/events/${encodeURIComponent(p.eventId)}`} className="mt-3 inline-flex h-10 w-full items-center justify-center gap-2 rounded-lg bg-gold-500 text-sm font-semibold text-white hover:bg-gold-600">
            <TicketIcon className="size-4" /> {g.bookTickets}
          </Link>
        </div>
      )}

      {p.restaurantId && (
        <Link href={`/${locale}/restaurants/${p.restaurantId}`} className="mt-4 inline-flex h-10 w-full items-center justify-center gap-2 rounded-lg bg-gold-500 text-sm font-semibold text-white hover:bg-gold-600">
          <TicketIcon className="size-4" /> {g.bookTable}
        </Link>
      )}

      {p.trainStation && (
        <Link href={`/${locale}/trains?from=${p.trainStation}`} className="mt-4 inline-flex h-10 w-full items-center justify-center gap-2 rounded-lg bg-gold-500 text-sm font-semibold text-white hover:bg-gold-600">
          <TicketIcon className="size-4" /> {g.bookTrain}
        </Link>
      )}

      <dl className="mt-5 space-y-3 text-sm">
        {!p.eventId && !p.transit && <div>
          <dt className="flex items-center gap-1.5 font-semibold text-ink"><ClockIcon className="size-4 text-slate-400" /> {g.hours}</dt>
          <dd className="mt-1 text-slate-700">
            {p.open24h ? g.open24h : p.hours?.length ? (
              <ul className="space-y-0.5">
                {p.hours.map((s, i) => (
                  <li key={i} className={cx("flex justify-between gap-3", s.days.includes(today) && "font-semibold text-ink")}>
                    <span>{daysLabel(s)}</span>
                    <span dir="ltr">{s.open} – {s.close}</span>
                  </li>
                ))}
              </ul>
            ) : g.hoursUnknown}
          </dd>
        </div>}
        {duration && <Row label={g.duration} value={duration} />}
        {cuisine && <Row label={g.cuisine} value={cuisine} />}
        {p.priceLevel && <Row label={g.price} value={`${"﷼".repeat(p.priceLevel)} · ${g.priceLevels[p.priceLevel]}`} />}
        {address && <Row label={g.address} value={address} />}
        {p.phone && (
          <Row label={g.phone} value={<a href={`tel:${p.phone.replace(/\s/g, "")}`} dir="ltr" className="inline-flex items-center gap-1 text-brand-700 hover:underline"><PhoneIcon className="size-3.5" />{p.phone}</a>} />
        )}
        {p.website && (
          <Row label={g.website} value={<a href={p.website} target="_blank" rel="noopener noreferrer" dir="ltr" className="inline-flex items-center gap-1 break-all text-brand-700 hover:underline"><GlobeIcon className="size-3.5" />{p.website.replace(/^https:\/\//, "")}</a>} />
        )}
      </dl>
      {p.tags.length > 0 && (
        <div className="mt-4 flex flex-wrap gap-1.5">
          {p.tags.map((tg) => <Badge key={tg} tone="brand">{g.tags[tg]}</Badge>)}
        </div>
      )}
      <p className="mt-5 text-xs text-slate-500">{g.timesNote}</p>
    </article>
  );
}

function Row({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex justify-between gap-4">
      <dt className="font-semibold text-ink">{label}</dt>
      <dd className="text-end text-slate-700">{value}</dd>
    </div>
  );
}
