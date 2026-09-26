/**
 * Guide places: storage, validation, search and per-user favourites.
 * Places come from three sources: the curated starter content (published once), OpenStreetMap
 * imports and the official-source connector (both land as drafts for the operations team to review).
 */
import { randomUUID } from "node:crypto";
import { SAUDI_CITIES } from "../data/cities";
import { store } from "../store";
import { isValidHHMM } from "./hours";
import { matchesQuery } from "./search";
import { seedPlaces } from "./seed";
import { PLACE_CATEGORIES, PLACE_TAGS, type OpeningSlot, type Place, type PlaceTag } from "./types";

/** Raised when curated places are added; existing places (and the team's edits) are kept. */
const SEED_FLAG = "guideSeed:v2";
const CITY_CODES = new Set(SAUDI_CITIES.map((c) => c.code));

/** Loads the curated starter content once (safe to call on every request). */
export async function ensureGuideSeeded(): Promise<void> {
  const s = store();
  if (await s.get("config", SEED_FLAG)) return;
  for (const p of seedPlaces()) await s.insert("places", p.id, p);
  await s.insert("config", SEED_FLAG, { id: SEED_FLAG, at: new Date().toISOString() });
}

export async function placesByCity(city: string): Promise<Place[]> {
  await ensureGuideSeeded();
  return store().findBy<Place>("places", "city", city);
}

export async function getPlace(id: string): Promise<Place | null> {
  await ensureGuideSeeded();
  return store().get<Place>("places", id);
}

/** Public fields only (drafts are never returned to visitors). */
export function publicPlace(p: Place) {
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const { status, sourceRef, ...rest } = p;
  return rest;
}
export type PublicPlace = ReturnType<typeof publicPlace>;

/** Published places of a city, sorted by curated first then name. */
export async function publishedPlaces(city: string): Promise<PublicPlace[]> {
  const rows = await placesByCity(city);
  const rank = { curated: 0, official: 1, osm: 2 } as const;
  return rows
    .filter((p) => p.status === "published")
    .sort((a, b) => rank[a.source] - rank[b.source] || a.nameEn.localeCompare(b.nameEn))
    .map(publicPlace);
}

/** Number of published places per city (for the city picker). */
export async function cityCounts(): Promise<Record<string, number>> {
  await ensureGuideSeeded();
  const all = await store().list<Place>("places", 20_000);
  const out: Record<string, number> = {};
  for (const p of all) if (p.status === "published") out[p.city] = (out[p.city] ?? 0) + 1;
  return out;
}

/* ------------------------------------------------------------ admin */

export class PlaceError extends Error {}

const str = (v: unknown, max: number) => (typeof v === "string" ? v.trim().slice(0, max) : "");
const num = (v: unknown) => (typeof v === "number" ? v : typeof v === "string" && v.trim() ? Number(v) : NaN);

/** Validates an admin edit (or an imported record) into a clean place. */
export function sanitizePlace(input: Record<string, unknown>, base?: Place): Place {
  const city = str(input.city, 3).toUpperCase();
  if (!CITY_CODES.has(city)) throw new PlaceError("invalidCity");
  const category = str(input.category, 20) as Place["category"];
  if (!PLACE_CATEGORIES.includes(category)) throw new PlaceError("invalidCategory");
  const nameAr = str(input.nameAr, 120);
  const nameEn = str(input.nameEn, 120);
  if (!nameAr || !nameEn) throw new PlaceError("nameRequired");
  const lat = num(input.lat);
  const lng = num(input.lng);
  // Saudi Arabia's bounding box (with a small margin).
  if (!(lat >= 16 && lat <= 32.5 && lng >= 34 && lng <= 56)) throw new PlaceError("invalidLocation");
  const hours = Array.isArray(input.hours)
    ? (input.hours as OpeningSlot[])
        .filter((h) => h && isValidHHMM(h.open) && isValidHHMM(h.close) && Array.isArray(h.days))
        .map((h) => ({ days: [...new Set(h.days.filter((d) => Number.isInteger(d) && d >= 0 && d <= 6))].sort(), open: h.open, close: h.close }))
        .filter((h) => h.days.length)
    : [];
  const priceLevel = num(input.priceLevel);
  const duration = num(input.durationMins);
  const website = str(input.website, 300);
  const tags = Array.isArray(input.tags) ? [...new Set((input.tags as string[]).filter((t): t is PlaceTag => (PLACE_TAGS as readonly string[]).includes(t)))] : [];
  const place: Place = {
    id: base?.id ?? str(input.id, 80) ?? randomUUID(),
    city, category, nameAr, nameEn,
    descriptionAr: str(input.descriptionAr, 1000),
    descriptionEn: str(input.descriptionEn, 1000),
    lat: Math.round(lat * 1e6) / 1e6,
    lng: Math.round(lng * 1e6) / 1e6,
    tags,
    source: base?.source ?? ((["curated", "osm", "official"] as const).find((s) => s === input.source) ?? "curated"),
    status: input.status === "published" ? "published" : "draft",
    updatedAt: new Date().toISOString(),
  };
  if (!place.id) place.id = randomUUID();
  const opt = { addressAr: str(input.addressAr, 200), addressEn: str(input.addressEn, 200), cuisineAr: str(input.cuisineAr, 60), cuisineEn: str(input.cuisineEn, 60), phone: str(input.phone, 30) };
  for (const [k, v] of Object.entries(opt)) if (v) (place as unknown as Record<string, unknown>)[k] = v;
  if (hours.length) place.hours = hours;
  if (input.open24h === true) place.open24h = true;
  if (priceLevel >= 1 && priceLevel <= 4) place.priceLevel = Math.round(priceLevel);
  if (duration > 0 && duration <= 24 * 60) place.durationMins = Math.round(duration);
  if (/^https:\/\/[^\s]+$/i.test(website)) place.website = website;
  const ref = base?.sourceRef ?? str(input.sourceRef, 120);
  if (ref) place.sourceRef = ref;
  return place;
}

export async function adminListPlaces(filter: { city?: string; status?: string; q?: string }) {
  await ensureGuideSeeded();
  const rows = filter.city ? await store().findBy<Place>("places", "city", filter.city) : await store().list<Place>("places", 20_000);
  return rows
    .filter((p) => !filter.status || p.status === filter.status)
    .filter((p) => !filter.q || matchesQuery(p, filter.q))
    .sort((a, b) => (a.status === b.status ? a.nameEn.localeCompare(b.nameEn) : a.status === "draft" ? -1 : 1));
}

export async function createPlace(input: Record<string, unknown>): Promise<Place> {
  const p = sanitizePlace({ ...input, id: undefined, source: "curated" });
  p.id = randomUUID();
  delete p.sourceRef;
  await store().put("places", p.id, p);
  return p;
}

export async function updatePlace(id: string, input: Record<string, unknown>): Promise<Place | null> {
  const base = await store().get<Place>("places", id);
  if (!base) return null;
  const next = sanitizePlace({ ...base, ...input }, base);
  await store().put("places", id, next);
  return next;
}

export async function deletePlace(id: string): Promise<boolean> {
  return store().delete("places", id);
}

/**
 * Adds imported places as drafts, skipping any source reference already known (including ones
 * the operations team edited or published). Returns the number added.
 */
export async function addImportedPlaces(city: string, items: Place[]): Promise<{ added: number; skipped: number }> {
  const existing = new Set((await store().findBy<Place>("places", "city", city)).map((p) => p.sourceRef).filter(Boolean));
  let added = 0;
  let skipped = 0;
  for (const p of items) {
    if (!p.sourceRef || existing.has(p.sourceRef)) { skipped++; continue; }
    const id = `${p.source}-${p.sourceRef.replace(/[^a-zA-Z0-9]+/g, "-")}`;
    if (await store().insert("places", id, { ...p, id, city, status: "draft" as const })) { added++; existing.add(p.sourceRef); } else skipped++;
  }
  return { added, skipped };
}

/* ------------------------------------------------------------ favourites */

interface FavoritesDoc { id: string; userId: string; ids: string[] }
const MAX_FAVORITES = 300;

export async function getFavorites(userId: string): Promise<string[]> {
  return (await store().get<FavoritesDoc>("favorites", userId))?.ids ?? [];
}

/** Adds and/or removes favourites (ids are checked against published places). */
export async function changeFavorites(userId: string, add: string[], remove: string[]): Promise<string[]> {
  const valid: string[] = [];
  for (const id of add.slice(0, 50)) {
    const p = typeof id === "string" ? await store().get<Place>("places", id) : null;
    if (p?.status === "published") valid.push(id);
  }
  const drop = new Set(remove);
  const s = store();
  const apply = (ids: string[]) => [...new Set([...ids.filter((i) => !drop.has(i)), ...valid])].slice(-MAX_FAVORITES);
  const doc = await s.update<FavoritesDoc>("favorites", userId, (d) => ({ ...d, ids: apply(d.ids) }));
  if (doc) return doc.ids;
  const fresh = { id: userId, userId, ids: apply([]) };
  if (await s.insert("favorites", userId, fresh)) return fresh.ids;
  return (await s.update<FavoritesDoc>("favorites", userId, (d) => ({ ...d, ids: apply(d.ids) })))?.ids ?? [];
}

/** Published places by id (favourites across cities). */
export async function publishedPlacesByIds(ids: string[]): Promise<PublicPlace[]> {
  await ensureGuideSeeded();
  const rows = await Promise.all([...new Set(ids)].slice(0, MAX_FAVORITES).map((id) => store().get<Place>("places", id)));
  return rows.filter((p): p is Place => p?.status === "published").map(publicPlace);
}
