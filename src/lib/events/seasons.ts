/**
 * Saudi seasons (Riyadh Season, Winter at Tantora…), managed by the operations team. The season id
 * is also the tag the events provider uses to group its events under the season.
 */
import { SAUDI_CITIES } from "../data/cities";
import { isValidISODate } from "../dates";
import { store } from "../store";
import type { Season } from "./types";

const SEED_FLAG = "seasonsSeed:v1";
const CITY_CODES = new Set(SAUDI_CITIES.map((c) => c.code));

type SeedSeason = Omit<Season, "status" | "updatedAt">;

/** Starter seasons; the operations team sets the official dates each year. */
export const SEED_SEASONS: SeedSeason[] = [
  { id: "riyadh-season", nameAr: "موسم الرياض", nameEn: "Riyadh Season", descriptionAr: "أكبر موسم ترفيهي في المنطقة: حفلات عالمية، عروض مسرحية، مباريات ونزالات كبرى، ومناطق ترفيهية مثل البوليفارد.", descriptionEn: "The region's biggest entertainment season: world-class concerts, shows, major fights and matches, and zones such as Boulevard.", cities: ["RUH"], startDate: "2026-10-10", endDate: "2027-03-31", color: "#6d28d9" },
  { id: "diriyah-season", nameAr: "موسم الدرعية", nameEn: "Diriyah Season", descriptionAr: "فعاليات ثقافية ورياضية وتجارب طعام في مهد الدولة السعودية الأولى.", descriptionEn: "Culture, sport and dining experiences in the birthplace of the first Saudi state.", cities: ["RUH"], startDate: "2026-11-15", endDate: "2027-03-15", color: "#b45309" },
  { id: "winter-at-tantora", nameAr: "شتاء طنطورة", nameEn: "Winter at Tantora", descriptionAr: "مهرجان العُلا الشتوي: حفلات في مرايا، وتجارب تراثية، ورحلات منطاد وجولات ليلية.", descriptionEn: "AlUla's winter festival: concerts at Maraya, heritage experiences, balloon flights and night tours.", cities: ["ULH"], startDate: "2026-12-17", endDate: "2027-02-13", color: "#c2410c" },
  { id: "jeddah-season", nameAr: "موسم جدة", nameEn: "Jeddah Season", descriptionAr: "فعاليات بحرية وحفلات وعروض عائلية على ساحل البحر الأحمر وفي جدة التاريخية.", descriptionEn: "Sea-side events, concerts and family shows on the Red Sea coast and in historic Jeddah.", cities: ["JED"], startDate: "2027-05-20", endDate: "2027-07-20", color: "#0369a1" },
  { id: "sharqiah-season", nameAr: "موسم الشرقية", nameEn: "Sharqiah Season", descriptionAr: "عروض ومهرجانات على ساحل الخليج العربي في الدمام والخبر والأحساء.", descriptionEn: "Shows and festivals on the Arabian Gulf coast in Dammam, Al Khobar and Al-Ahsa.", cities: ["DMM", "HOF"], startDate: "2027-03-01", endDate: "2027-04-10", color: "#0f766e" },
];

export async function ensureSeasonsSeeded(): Promise<void> {
  const s = store();
  if (await s.get("config", SEED_FLAG)) return;
  const now = new Date().toISOString();
  for (const x of SEED_SEASONS) await s.insert<Season>("seasons", x.id, { ...x, status: "published", updatedAt: now });
  await s.insert("config", SEED_FLAG, { id: SEED_FLAG, at: now });
}

export async function listSeasons(includeHidden = false): Promise<Season[]> {
  await ensureSeasonsSeeded();
  const all = await store().list<Season>("seasons", 500);
  return all.filter((x) => includeHidden || x.status === "published").sort((a, b) => a.startDate.localeCompare(b.startDate));
}

/** Seasons still running or upcoming (for travellers). */
export async function currentSeasons(today: string): Promise<Season[]> {
  return (await listSeasons()).filter((x) => x.endDate >= today);
}

export class SeasonError extends Error {}

const str = (v: unknown, max: number) => (typeof v === "string" ? v.trim().slice(0, max) : "");
export const seasonSlug = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "").slice(0, 60);

export function sanitizeSeason(input: Record<string, unknown>, id: string): Season {
  const nameAr = str(input.nameAr, 80);
  const nameEn = str(input.nameEn, 80);
  if (!nameAr || !nameEn) throw new SeasonError("nameRequired");
  const startDate = str(input.startDate, 10);
  const endDate = str(input.endDate, 10);
  if (!isValidISODate(startDate) || !isValidISODate(endDate) || endDate < startDate) throw new SeasonError("invalidDates");
  const cities = Array.isArray(input.cities) ? [...new Set((input.cities as unknown[]).filter((c): c is string => typeof c === "string" && CITY_CODES.has(c)))] : [];
  if (!cities.length) throw new SeasonError("citiesRequired");
  const color = /^#[0-9a-f]{6}$/i.test(str(input.color, 7)) ? str(input.color, 7) : "#0f766e";
  if (!id) throw new SeasonError("nameRequired");
  return {
    id, nameAr, nameEn, cities, startDate, endDate, color,
    descriptionAr: str(input.descriptionAr, 600),
    descriptionEn: str(input.descriptionEn, 600),
    status: input.status === "hidden" ? "hidden" : "published",
    updatedAt: new Date().toISOString(),
  };
}

export async function createSeason(input: Record<string, unknown>): Promise<Season> {
  await ensureSeasonsSeeded();
  const season = sanitizeSeason(input, seasonSlug(str(input.id, 60) || str(input.nameEn, 80)));
  if (!(await store().insert("seasons", season.id, season))) throw new SeasonError("duplicate");
  return season;
}

export async function updateSeason(id: string, input: Record<string, unknown>): Promise<Season | null> {
  const base = await store().get<Season>("seasons", id);
  if (!base) return null;
  const next = sanitizeSeason({ ...base, ...input }, id);
  await store().put("seasons", id, next);
  return next;
}

export const deleteSeason = (id: string) => store().delete("seasons", id);
