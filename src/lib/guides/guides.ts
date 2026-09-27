/**
 * Licensed tour guides from the Ministry of Tourism. Only guides with a valid licence are kept:
 * the daily sync (MoT API, when configured) and the back-office import skip expired licences, and a
 * guide whose licence expires is hidden at once (directory, search, verification details, planner
 * suggestions) — pending booking requests are then cancelled and the traveller told.
 *
 * MoT API (when available): MT_GUIDES_URL returning a JSON array (or { data: [...] }) of guides with
 * licenseNo, licenseExpiry, nameAr, nameEn, gender, mobile, email, languages [{code, level}],
 * cities (city codes), tracks, bioAr, bioEn; authenticated with MT_GUIDES_TOKEN (Bearer).
 */
import { CITY_CENTERS } from "../guide/centers";
import { mtConfig } from "../config";
import { store } from "../store";
import { DEMO_GUIDES } from "./demo";
import { GUIDE_TRACKS, LANGUAGE_LEVELS, type GuideFilters, type GuideLanguage, type GuideTrack, type PublicGuide } from "./types";

const COL = "guides" as const;

export interface StoredGuide extends PublicGuide {
  id: string;
  source: "mt" | "import" | "demo";
  updatedAt: string;
  /** Set when a sync no longer lists the guide (licence withdrawn). */
  removed?: boolean;
}

export const ksaToday = (now = new Date()) => new Date(now.getTime() + 3 * 3600_000).toISOString().slice(0, 10);
export const isLicensed = (g: Pick<StoredGuide, "licenseExpiry" | "removed">, today = ksaToday()) => !g.removed && g.licenseExpiry >= today;

const demoEnabled = () => mtConfig().mock && process.env.DEMO_GUIDES !== "off";

/** Seeds the sample guides once (sandbox). */
export async function ensureDemo() {
  if (!demoEnabled()) return;
  if (!(await store().insert("config", "guidesDemo:v1", { id: "guidesDemo:v1" }))) return;
  const now = new Date().toISOString();
  for (const g of DEMO_GUIDES()) await store().insert(COL, g.licenseNo, { ...g, id: g.licenseNo, source: "demo", updatedAt: now, demo: true } satisfies StoredGuide);
}

export function toPublicGuide(g: StoredGuide): PublicGuide {
  const { licenseNo, licenseExpiry, nameAr, nameEn, gender, phone, email, languages, cities, tracks, bioAr, bioEn, hasPhoto, demo } = g;
  return { licenseNo, licenseExpiry, nameAr, nameEn, gender, phone, email, languages, cities, tracks, bioAr, bioEn, hasPhoto, ...(demo ? { demo } : {}) };
}

async function all(): Promise<StoredGuide[]> {
  await ensureDemo();
  return store().list<StoredGuide>(COL, 10_000);
}

const LEVEL_RANK: Record<string, number> = { native: 0, fluent: 1, good: 2 };

/** The directory: licensed guides only, filtered; those mastering the wanted language first. */
export async function searchGuides(f: GuideFilters = {}, now = new Date()): Promise<PublicGuide[]> {
  const today = ksaToday(now);
  const q = f.q?.trim().toLowerCase();
  const lang = f.language?.toLowerCase();
  return (await all())
    .filter((g) => isLicensed(g, today))
    .filter((g) => (!f.city || g.cities.includes(f.city)) && (!f.track || g.tracks.includes(f.track as GuideTrack)) && (!f.gender || g.gender === f.gender))
    .filter((g) => !lang || g.languages.some((l) => l.code === lang))
    .filter((g) => !q || `${g.nameAr} ${g.nameEn} ${g.licenseNo}`.toLowerCase().includes(q))
    .sort((a, b) => {
      if (lang) {
        const la = LEVEL_RANK[a.languages.find((l) => l.code === lang)!.level];
        const lb = LEVEL_RANK[b.languages.find((l) => l.code === lang)!.level];
        if (la !== lb) return la - lb;
      }
      return a.nameEn.localeCompare(b.nameEn);
    })
    .map(toPublicGuide);
}

/** A licensed guide's profile (null when unknown or no longer licensed). */
export async function getGuide(licenseNo: string, now = new Date()): Promise<PublicGuide | null> {
  await ensureDemo();
  const g = await store().get<StoredGuide>(COL, licenseNo.trim());
  return g && isLicensed(g, ksaToday(now)) ? toPublicGuide(g) : null;
}

/** Licence check by number: valid with the guide's name and languages, expired, or not found. */
export async function verifyLicense(licenseNo: string, now = new Date()): Promise<{ result: "valid" | "expired" | "notFound"; guide?: Pick<PublicGuide, "licenseNo" | "nameAr" | "nameEn" | "licenseExpiry" | "languages" | "cities" | "hasPhoto" | "demo"> }> {
  await ensureDemo();
  const g = await store().get<StoredGuide>(COL, licenseNo.trim());
  if (!g) return { result: "notFound" };
  if (!isLicensed(g, ksaToday(now))) return { result: "expired" };
  const { nameAr, nameEn, licenseExpiry, languages, cities, hasPhoto, demo } = toPublicGuide(g);
  return { result: "valid", guide: { licenseNo: g.licenseNo, nameAr, nameEn, licenseExpiry, languages, cities, hasPhoto, ...(demo ? { demo } : {}) } };
}

/** Guides suggested for a trip: its cities, the traveller's language, the plan's interests. */
export async function suggestGuides(cities: string[], language: string | null, tracks: string[], now = new Date()): Promise<Record<string, PublicGuide[]>> {
  const out: Record<string, PublicGuide[]> = {};
  for (const city of [...new Set(cities)]) {
    let list = await searchGuides({ city, language: language ?? undefined }, now);
    if (!list.length && language) list = await searchGuides({ city }, now);
    out[city] = list
      .map((g) => ({ g, s: g.tracks.filter((t) => tracks.includes(t)).length }))
      .sort((a, b) => b.s - a.s)
      .slice(0, 3)
      .map((x) => x.g);
  }
  return out;
}

/* --------------------------------------------------------------- import */

export interface ImportResult { imported: number; skippedExpired: number; invalid: number; removed: number }

function normalise(raw: Record<string, unknown>): Omit<StoredGuide, "id" | "source" | "updatedAt"> | null {
  const s = (k: string) => (typeof raw[k] === "string" ? (raw[k] as string).trim() : "");
  const licenseNo = s("licenseNo");
  const licenseExpiry = s("licenseExpiry");
  if (!/^[\w-]{3,30}$/.test(licenseNo) || !/^\d{4}-\d{2}-\d{2}$/.test(licenseExpiry) || !(s("nameAr") || s("nameEn"))) return null;
  const list = (v: unknown) => (Array.isArray(v) ? v : typeof v === "string" ? v.split(/[|;,]/) : []).map((x) => String(x).trim()).filter(Boolean);
  const languages: GuideLanguage[] = (Array.isArray(raw.languages) ? raw.languages : list(raw.languages).map((x) => { const [code, level] = x.split(":"); return { code, level }; }))
    .map((l): { code?: unknown; level?: unknown } => (typeof l === "object" && l ? l : { code: l }))
    .map((l) => ({ code: String(l.code ?? "").toLowerCase().trim(), level: (LANGUAGE_LEVELS as readonly string[]).includes(String(l.level)) ? (l.level as GuideLanguage["level"]) : "fluent" }))
    .filter((l) => /^[a-z]{2}$/.test(l.code));
  return {
    licenseNo, licenseExpiry, nameAr: s("nameAr") || s("nameEn"), nameEn: s("nameEn") || s("nameAr"), gender: s("gender") === "female" ? "female" : "male",
    phone: (s("mobile") || s("phone")).replace(/[^\d+]/g, ""), email: s("email") || null, languages,
    cities: list(raw.cities).map((c) => c.toUpperCase()).filter((c) => CITY_CENTERS[c]),
    tracks: list(raw.tracks).filter((t): t is GuideTrack => (GUIDE_TRACKS as readonly string[]).includes(t)),
    bioAr: s("bioAr").slice(0, 600), bioEn: s("bioEn").slice(0, 600), hasPhoto: false,
  };
}

/** Saves the valid-licence guides of a list; with `full`, guides missing from it are marked removed. */
export async function importGuides(rows: Record<string, unknown>[], source: "mt" | "import", opts: { full?: boolean } = {}, now = new Date()): Promise<ImportResult> {
  const today = ksaToday(now);
  const res: ImportResult = { imported: 0, skippedExpired: 0, invalid: 0, removed: 0 };
  const seen = new Set<string>();
  for (const raw of rows) {
    const g = normalise(raw);
    if (!g) {
      res.invalid++;
      continue;
    }
    seen.add(g.licenseNo);
    if (g.licenseExpiry < today) {
      res.skippedExpired++;
      // A licence reported as expired hides an existing guide too.
      await store().update<StoredGuide>(COL, g.licenseNo, (x) => ({ ...x, licenseExpiry: g.licenseExpiry, updatedAt: now.toISOString() }));
      continue;
    }
    await store().put(COL, g.licenseNo, { ...g, id: g.licenseNo, source, updatedAt: now.toISOString() } satisfies StoredGuide);
    res.imported++;
  }
  if (opts.full) {
    for (const g of await store().list<StoredGuide>(COL, 10_000)) {
      if (g.source === source && !seen.has(g.licenseNo) && !g.removed) {
        await store().update<StoredGuide>(COL, g.licenseNo, (x) => ({ ...x, removed: true, updatedAt: now.toISOString() }));
        res.removed++;
      }
    }
  }
  return res;
}

/** Parses the back-office CSV (header row; languages as "en:fluent|fr:good"; cities and tracks "|"-separated). */
export function parseGuidesCsv(text: string): Record<string, string>[] {
  const rows: string[][] = [];
  let row: string[] = [];
  let cur = "";
  let quoted = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (quoted) {
      if (ch === '"' && text[i + 1] === '"') { cur += '"'; i++; }
      else if (ch === '"') quoted = false;
      else cur += ch;
    } else if (ch === '"') quoted = true;
    else if (ch === ",") { row.push(cur); cur = ""; }
    else if (ch === "\n" || ch === "\r") {
      if (ch === "\r" && text[i + 1] === "\n") i++;
      row.push(cur); cur = "";
      if (row.some((c) => c.trim())) rows.push(row);
      row = [];
    } else cur += ch;
  }
  row.push(cur);
  if (row.some((c) => c.trim())) rows.push(row);
  const [head, ...body] = rows;
  if (!head) return [];
  const keys = head.map((h) => h.trim().replace(/^﻿/, ""));
  return body.map((r) => Object.fromEntries(keys.map((k, i) => [k, (r[i] ?? "").trim()])));
}

/** Daily sync with the Ministry of Tourism (when MT_GUIDES_URL is set). */
export async function syncGuidesFromMt(now = new Date()): Promise<ImportResult | null> {
  const url = process.env.MT_GUIDES_URL?.trim();
  if (!url) return null;
  const res = await fetch(url, { headers: { accept: "application/json", ...(process.env.MT_GUIDES_TOKEN ? { authorization: `Bearer ${process.env.MT_GUIDES_TOKEN}` } : {}) } });
  if (!res.ok) throw new Error(`MoT guides API ${res.status}`);
  const body = (await res.json()) as unknown;
  const rows = (Array.isArray(body) ? body : ((body as { data?: unknown[] })?.data ?? [])) as Record<string, unknown>[];
  return importGuides(rows, "mt", { full: true }, now);
}

/** Back office: every guide with its licence state. */
export async function adminGuides(now = new Date()) {
  const today = ksaToday(now);
  return (await all())
    .sort((a, b) => a.nameEn.localeCompare(b.nameEn))
    .map((g) => ({ ...toPublicGuide(g), source: g.source, updatedAt: g.updatedAt, licensed: isLicensed(g, today), removed: !!g.removed }));
}
