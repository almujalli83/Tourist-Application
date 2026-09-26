/**
 * What a plan can be built from: published guide places, bookable restaurants and events on sale
 * (with their sessions) per city. The planner (Claude or the rules) only picks from these, so a
 * plan never mentions a place the app doesn't know; each pick is resolved here into a plan item.
 */
import { summaries } from "../reviews/summaries";
import { randomUUID } from "node:crypto";
import { eventsCatalog, minPriceSAR, openSessions } from "../events/orders";
import { ksaDay } from "../events/format";
import type { EventItem } from "../events/types";
import { cityCounts, publishedPlaces, type PublicPlace } from "../guide/repo";
import { listRestaurants, type Restaurant } from "../restaurants/catalog";
import type { PlanItem } from "./types";

export interface EventSlot { id: string; date: string; time: string }
export interface CityPool {
  city: string;
  places: PublicPlace[];
  restaurants: Restaurant[];
  events: { event: EventItem; slots: EventSlot[] }[];
  /** Verified traveller ratings by ref ("place:…", "restaurant:…", "event:…"). */
  ratings: Record<string, { avg: number; count: number }>;
}
export type Pools = Map<string, CityPool>;

/** Cities the planner can suggest: those with enough published places in the guide. */
export async function plannerCities(): Promise<string[]> {
  const counts = await cityCounts();
  return Object.entries(counts).filter(([, n]) => n >= 3).map(([c]) => c);
}

const ksaTime = (iso: string) => new Date(Date.parse(iso) + 3 * 3_600_000).toISOString().slice(11, 16);

export async function loadPools(cities: string[], from: string, to: string, now = new Date()): Promise<Pools> {
  const [catalog, restaurants] = await Promise.all([eventsCatalog({ from, to }), Promise.resolve(listRestaurants())]);
  const pools: Pools = new Map();
  for (const city of cities) {
    const events = catalog
      .filter((e) => e.city === city)
      .map((event) => ({
        event,
        slots: openSessions(event, now)
          .map((s) => ({ id: s.id, date: ksaDay(s.start), time: ksaTime(s.start) }))
          .filter((s) => s.date >= from && s.date <= to),
      }))
      .filter((e) => e.slots.length);
    const places = await publishedPlaces(city);
    const cityRestaurants = restaurants.filter((r) => r.city === city);
    const ratings: CityPool["ratings"] = {};
    const add = (kind: string, map: Record<string, { avg: number; count: number }>) => {
      for (const [id, s] of Object.entries(map)) if (s.count) ratings[`${kind}:${id}`] = { avg: s.avg, count: s.count };
    };
    add("place", await summaries("place", places.map((p) => p.id)));
    add("restaurant", await summaries("restaurant", cityRestaurants.map((r) => r.id)));
    add("event", await summaries("event", events.map((e) => e.event.id)));
    pools.set(city, { city, places, restaurants: cityRestaurants, events, ratings });
  }
  return pools;
}

export interface Party { adults: number; children: number; infants: number; /** Age of the youngest child, if any (events can have a minimum age). */ youngest: number | null }

/** Turns a pick ("place:…", "restaurant:…", "event:<id>@<date>T<time>") into a plan item, or null if it isn't valid for that city and day. */
export function resolveRef(ref: string, pool: CityPool | undefined, date: string, party: Party, extra: { note?: string; meal?: string; id?: string } = {}): PlanItem | null {
  if (!pool || typeof ref !== "string") return null;
  const [kind, rest = ""] = [ref.slice(0, ref.indexOf(":")), ref.slice(ref.indexOf(":") + 1)];
  const note = typeof extra.note === "string" ? extra.note.trim().slice(0, 280) : "";
  const id = typeof extra.id === "string" && /^[\w-]{6,40}$/.test(extra.id) ? extra.id : randomUUID().slice(0, 12);
  const guests = Math.max(1, party.adults + party.children);
  if (kind === "place") {
    const p = pool.places.find((x) => x.id === rest);
    if (!p) return null;
    const dining = p.category === "restaurant" || p.category === "cafe";
    const meal = dining && (extra.meal === "lunch" || extra.meal === "dinner") ? extra.meal : undefined;
    return {
      id, ref: `place:${p.id}`, kind: "place", titleAr: p.nameAr, titleEn: p.nameEn, note, lat: p.lat, lng: p.lng,
      durationMins: p.durationMins ?? (dining ? 75 : 90), category: p.category, meal, hours: p.hours, open24h: p.open24h,
    };
  }
  if (kind === "restaurant") {
    const r = pool.restaurants.find((x) => x.id === rest);
    if (!r) return null;
    const meal = extra.meal === "lunch" ? "lunch" : "dinner";
    return {
      id, ref: `restaurant:${r.id}`, kind: "restaurant", titleAr: r.nameAr, titleEn: r.nameEn, note, lat: r.lat, lng: r.lng,
      durationMins: meal === "lunch" ? 75 : 90, category: "restaurant", meal, hours: r.hours,
      bookHref: `/restaurants/${r.id}?date=${date}&party=${Math.min(r.maxParty, guests)}`,
    };
  }
  if (kind === "event") {
    const [eventId, when = ""] = rest.split("@");
    const e = pool.events.find((x) => x.event.id === eventId);
    const slot = e?.slots.find((s) => `${s.date}T${s.time}` === when || s.id === when);
    if (!e || !slot || slot.date !== date) return null;
    if (e.event.minAge && party.youngest !== null && party.youngest < e.event.minAge) return null;
    return {
      id, ref: `event:${e.event.id}@${slot.date}T${slot.time}`, kind: "event", titleAr: e.event.titleAr, titleEn: e.event.titleEn, note,
      lat: e.event.lat, lng: e.event.lng, durationMins: e.event.durationMins, category: e.event.category, fixedStart: slot.time,
      costSAR: minPriceSAR(e.event) * guests, bookHref: `/events/${e.event.id}?session=${encodeURIComponent(slot.id)}`,
    };
  }
  return null;
}
