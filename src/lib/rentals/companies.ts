/**
 * Rental companies directory, edited by operations: names, colour, logo and the cities they rent
 * in. A company's API link is set in RENTAL_PROVIDERS with the same id; until it is linked the
 * sandbox simulates it (sample prices). Inactive companies are never shown.
 */
import { store } from "../store";

export interface RentalCompany {
  id: string;
  nameAr: string;
  nameEn: string;
  /** Brand colour for the name badge shown when there is no logo. */
  color: string;
  cities: string[];
  active: boolean;
  /** Uploaded logo (data URL, PNG/JPEG/WebP/SVG), served by /api/rentals/logo/{id}. */
  logo: string | null;
  /** Changes with every logo upload (cache busting). */
  logoVersion: number;
}

const DOC = "rentalCompanies";
const BIG = ["RUH", "JED", "DMM", "MED"];
const WIDE = ["RUH", "JED", "DMM", "MED", "AHB", "ULH", "TUU", "TIF", "HAS", "ELQ", "HOF", "GIZ", "YNB"];

/** Major companies renting cars in the Kingdom (cities to be confirmed at contracting). */
export const DEFAULT_COMPANIES: RentalCompany[] = [
  { id: "theeb", nameAr: "ذيب", nameEn: "Theeb", color: "#1D4F91", cities: WIDE },
  { id: "yelo", nameAr: "يلو", nameEn: "Yelo", color: "#F2B600", cities: WIDE },
  { id: "lumi", nameAr: "لومي", nameEn: "Lumi", color: "#5B2D90", cities: [...BIG, "AHB", "TUU", "ELQ"] },
  { id: "budget", nameAr: "بدجت", nameEn: "Budget", color: "#F47920", cities: WIDE },
  { id: "avis", nameAr: "أفيس", nameEn: "Avis", color: "#D4002A", cities: [...BIG, "AHB", "ULH"] },
  { id: "hertz", nameAr: "هيرتز", nameEn: "Hertz", color: "#FFD100", cities: [...BIG, "ULH"] },
  { id: "enterprise", nameAr: "إنتربرايز", nameEn: "Enterprise", color: "#169B62", cities: BIG },
  { id: "sixt", nameAr: "سيكست", nameEn: "Sixt", color: "#FF5F00", cities: BIG },
  { id: "europcar", nameAr: "يوروبكار", nameEn: "Europcar", color: "#00843D", cities: BIG },
].map((c) => ({ ...c, active: true, logo: null, logoVersion: 0 }));

export async function listCompanies(): Promise<RentalCompany[]> {
  const kept = await store().get<{ companies: RentalCompany[] }>("config", DOC);
  return kept?.companies ?? DEFAULT_COMPANIES;
}

export async function getCompany(id: string): Promise<RentalCompany | null> {
  return (await listCompanies()).find((c) => c.id === id) ?? null;
}

const LOGO = /^data:image\/(png|jpeg|webp|svg\+xml);base64,[A-Za-z0-9+/=]+$/;
export const LOGO_MAX_BYTES = 150_000;

/** Saves the directory edited by operations (a new logo, or null to remove it, per company). */
export async function saveCompanies(input: unknown): Promise<RentalCompany[]> {
  const before = await listCompanies();
  const rows = (Array.isArray(input) ? input : []) as Record<string, unknown>[];
  const seen = new Set<string>();
  const out: RentalCompany[] = [];
  for (const r of rows.slice(0, 40)) {
    const id = String(r.id ?? "").toLowerCase().replace(/[^a-z0-9-]/g, "").slice(0, 30);
    const nameAr = String(r.nameAr ?? "").trim().slice(0, 60);
    const nameEn = String(r.nameEn ?? "").trim().slice(0, 60);
    if (!id || id === "sandbox" || seen.has(id) || !nameAr || !nameEn) throw new Error("invalidCompany");
    seen.add(id);
    const old = before.find((c) => c.id === id);
    let logo = old?.logo ?? null;
    let logoVersion = old?.logoVersion ?? 0;
    if (r.logo === null || typeof r.logo === "string") {
      const next = r.logo as string | null;
      if (next !== logo) {
        if (next !== null && (!LOGO.test(next) || next.length > (LOGO_MAX_BYTES * 4) / 3 + 40)) throw new Error("invalidLogo");
        logo = next;
        logoVersion++;
      }
    }
    out.push({
      id, nameAr, nameEn,
      color: /^#[0-9a-f]{6}$/i.test(String(r.color)) ? String(r.color) : "#334155",
      cities: (Array.isArray(r.cities) ? r.cities : String(r.cities ?? "").split(",")).map((c) => String(c).trim().toUpperCase()).filter((c) => /^[A-Z]{3}$/.test(c)),
      active: r.active !== false,
      logo, logoVersion,
    });
  }
  if (!out.length) throw new Error("invalidCompany");
  await store().put("config", DOC, { id: DOC, companies: out });
  return out;
}
