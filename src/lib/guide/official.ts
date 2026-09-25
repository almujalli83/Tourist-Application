/**
 * Connector to an official destinations source (e.g. the tourism authority's content feed).
 *
 * Live when OFFICIAL_GUIDE_URL + OFFICIAL_GUIDE_TOKEN are set: GET {url}/places?city={code}
 * returning { places: [{ id, category, nameAr, nameEn, descriptionAr, descriptionEn, lat, lng,
 * addressAr?, addressEn?, phone?, website?, openingHours? }] } (the contract is to be confirmed
 * with the provider). Imported places are drafts for the operations team to review.
 * Without the settings the connector is reported as not configured (no invented data).
 */
import { CITY_CENTERS } from "./centers";
import { parseOpeningHours } from "./osm";
import { PLACE_CATEGORIES, type Place } from "./types";

export const officialGuideConfigured = () => !!(process.env.OFFICIAL_GUIDE_URL?.trim() && process.env.OFFICIAL_GUIDE_TOKEN?.trim());

interface OfficialItem {
  id?: string | number;
  category?: string;
  nameAr?: string;
  nameEn?: string;
  descriptionAr?: string;
  descriptionEn?: string;
  lat?: number;
  lng?: number;
  addressAr?: string;
  addressEn?: string;
  phone?: string;
  website?: string;
  openingHours?: string;
}

export class OfficialGuideError extends Error {}

export async function fetchOfficialPlaces(city: string, fetchImpl: typeof fetch = fetch): Promise<Place[]> {
  if (!officialGuideConfigured()) throw new OfficialGuideError("notConfigured");
  if (!CITY_CENTERS[city]) throw new OfficialGuideError("invalidCity");
  const base = process.env.OFFICIAL_GUIDE_URL!.trim().replace(/\/$/, "");
  const res = await fetchImpl(`${base}/places?city=${encodeURIComponent(city)}`, {
    headers: { authorization: `Bearer ${process.env.OFFICIAL_GUIDE_TOKEN!.trim()}`, accept: "application/json" },
    signal: AbortSignal.timeout(30_000),
  });
  if (!res.ok) throw new OfficialGuideError(`upstream ${res.status}`);
  const data = (await res.json()) as { places?: OfficialItem[] };
  const now = new Date().toISOString();
  const out: Place[] = [];
  for (const it of data.places ?? []) {
    const category = (PLACE_CATEGORIES as readonly string[]).includes(it.category ?? "") ? (it.category as Place["category"]) : "landmark";
    if (it.id == null || typeof it.lat !== "number" || typeof it.lng !== "number" || !(it.nameAr || it.nameEn)) continue;
    const p: Place = {
      id: "", city, category,
      nameAr: (it.nameAr || it.nameEn)!.slice(0, 120), nameEn: (it.nameEn || it.nameAr)!.slice(0, 120),
      descriptionAr: (it.descriptionAr ?? "").slice(0, 1000), descriptionEn: (it.descriptionEn ?? "").slice(0, 1000),
      lat: it.lat, lng: it.lng, tags: [], source: "official", sourceRef: String(it.id), status: "draft", updatedAt: now,
      ...parseOpeningHours(it.openingHours),
    };
    if (it.addressAr) p.addressAr = it.addressAr.slice(0, 200);
    if (it.addressEn) p.addressEn = it.addressEn.slice(0, 200);
    if (it.phone) p.phone = it.phone.slice(0, 30);
    if (it.website && /^https:\/\//i.test(it.website)) p.website = it.website.slice(0, 300);
    out.push(p);
  }
  return out;
}
