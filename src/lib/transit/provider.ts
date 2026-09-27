/**
 * Public transport operators, connected by API (Riyadh: the darb network — metro and buses).
 * Each operator implements: journey planning (metro + bus with changes), live arrivals, ticket
 * products and sales (QR codes used at the gates), ticket activation, and transit-card top-ups.
 *
 * Linked operators are configured in TRANSIT_PROVIDERS (JSON array):
 *   [{ "city": "RUH", "nameAr": "…", "nameEn": "…", "url": "https://api.operator.sa/v1", "token": "…" }]
 * Expected endpoints (to be matched with the operator's specification):
 *   POST {url}/journeys           { from:{lat,lng,name}, to:{lat,lng,name}, departAt } → [Journey]
 *   GET  {url}/arrivals?lat&lng   → [Arrival]
 *   GET  {url}/products           → [TransitProduct]
 *   POST {url}/orders             { productId, qty, reference, email } → { ref, tickets: [{ code }] }
 *   POST {url}/tickets/{code}/activate → { activatedAt, validUntil }
 *   POST {url}/cards/{cardNo}/topups   { amountSAR, reference } → { ref, balanceSAR? }   (when "topUp": true)
 *   GET  {url}/stops              → [{ id, nameAr, nameEn, lat, lng }]
 *   GET  {url}/lines              → [{ id, nameAr, nameEn, color, stops: [stop] }]   (optional)
 * Sandbox (no MT credentials): Riyadh is simulated on the metro network (stations from the open
 * data); Makkah, Madinah, Jeddah and Dammam on sample bus networks (networks.ts). Sample fares and
 * estimated times. Off with DEMO_TRANSIT=off.
 */
import { createHash, randomBytes } from "node:crypto";
import { mtConfig } from "../config";
import { distanceKm } from "../guide/geo";
import { getMetro } from "../metro/provider";
import { METRO_LINES, type MetroLineId, type MetroStation } from "../metro/types";
import { allStops, BUS_NETWORKS, type BusNetwork, type NetLine, type NetStop } from "./networks";
import type { Arrival, Journey, JourneyLeg, TransitLine, TransitPlace, TransitProduct, TransitStop } from "./types";

export class TransitProviderError extends Error {
  constructor(public code: "unavailable" | "rejected") {
    super(code);
  }
}

export type { TransitLine, TransitStop };

export interface TransitProvider {
  city: string;
  nameAr: string;
  nameEn: string;
  sandbox: boolean;
  /** A metro network (map tab), and top-ups of a transit card. */
  features: { metro: boolean; topUp: boolean };
  stops(): Promise<TransitStop[]>;
  /** Bus lines with their stops, for the day plan (null when the operator doesn't publish them). */
  lines(): Promise<TransitLine[] | null>;
  plan(from: TransitPlace, to: TransitPlace, departAt: string): Promise<Journey[]>;
  arrivals(at: { lat: number; lng: number }, now: Date): Promise<Arrival[]>;
  products(): Promise<TransitProduct[]>;
  buy(r: { productId: string; qty: number; reference: string; email: string }): Promise<{ ref: string; codes: string[] }>;
  activate(code: string, now: Date, validityMins: number): Promise<{ activatedAt: string; validUntil: string }>;
  topUp(cardNo: string, amountSAR: number, reference: string): Promise<{ ref: string; balanceSAR: number | null }>;
}

/* ------------------------------------------------------------------ API */

interface OperatorConfig { city: string; nameAr?: string; nameEn?: string; url: string; token?: string; metro?: boolean; topUp?: boolean }

function readConfig(): OperatorConfig[] {
  try {
    const list = JSON.parse(process.env.TRANSIT_PROVIDERS ?? "[]") as OperatorConfig[];
    return Array.isArray(list) ? list.filter((p) => p && typeof p.city === "string" && typeof p.url === "string") : [];
  } catch {
    return [];
  }
}

const arr = (b: unknown) => (Array.isArray(b) ? b : ((b as { data?: unknown[] })?.data ?? [])) as Record<string, unknown>[];

function apiProvider(c: OperatorConfig): TransitProvider {
  const base = c.url.replace(/\/$/, "");
  const call = async (path: string, init: RequestInit = {}) => {
    let res: Response;
    try {
      res = await fetch(`${base}${path}`, {
        ...init,
        headers: { accept: "application/json", "content-type": "application/json", ...(c.token ? { authorization: `Bearer ${c.token}` } : {}) },
        signal: AbortSignal.timeout(15_000),
      });
    } catch {
      throw new TransitProviderError("unavailable");
    }
    if (res.status >= 400 && res.status < 500) throw new TransitProviderError("rejected");
    if (!res.ok) throw new TransitProviderError("unavailable");
    return res.status === 204 ? null : ((await res.json().catch(() => null)) as unknown);
  };
  return {
    city: c.city.toUpperCase(), nameAr: c.nameAr || c.nameEn || c.city, nameEn: c.nameEn || c.city, sandbox: false,
    features: { metro: c.metro === true, topUp: c.topUp !== false },
    async stops() {
      return arr(await call("/stops")).filter((x) => typeof x.id === "string" && Number.isFinite(Number(x.lat)) && Number.isFinite(Number(x.lng)))
        .map((x) => ({ id: x.id as string, nameAr: String(x.nameAr ?? x.nameEn ?? x.id), nameEn: String(x.nameEn ?? x.id), lat: Number(x.lat), lng: Number(x.lng) }));
    },
    async lines() {
      const b = await call("/lines").catch(() => null);
      return b ? (arr(b).filter((l) => typeof l.id === "string" && Array.isArray(l.stops)) as unknown as TransitLine[]) : null;
    },
    async plan(from, to, departAt) {
      return arr(await call("/journeys", { method: "POST", body: JSON.stringify({ from, to, departAt }) }))
        .filter((j) => Array.isArray(j.legs) && (j.legs as unknown[]).length > 0)
        .map((j, i) => ({ ...(j as unknown as Journey), id: String(j.id ?? `j${i + 1}`) }));
    },
    async arrivals(at) {
      return arr(await call(`/arrivals?lat=${at.lat}&lng=${at.lng}`)).filter((a) => typeof a.line === "string" && Number.isFinite(Number(a.inMins))) as unknown as Arrival[];
    },
    async products() {
      return arr(await call("/products")).filter((p) => typeof p.id === "string" && Number(p.priceSAR) > 0 && Number(p.validityMins) > 0).map((p) => ({
        id: p.id as string, nameAr: String(p.nameAr ?? p.nameEn ?? p.id), nameEn: String(p.nameEn ?? p.id), cls: p.cls === "first" ? "first" : "standard",
        validityMins: Number(p.validityMins), priceSAR: Math.round(Number(p.priceSAR) * 100) / 100,
        modes: (Array.isArray(p.modes) ? p.modes : ["metro", "bus"]).filter((m): m is "metro" | "bus" => m === "metro" || m === "bus"),
      }));
    },
    async buy(r) {
      const b = (await call("/orders", { method: "POST", body: JSON.stringify(r) })) as { ref?: unknown; tickets?: { code?: unknown }[] } | null;
      const codes = (b?.tickets ?? []).map((t) => t.code).filter((x): x is string => typeof x === "string");
      if (typeof b?.ref !== "string" || codes.length !== r.qty) throw new TransitProviderError("rejected");
      return { ref: b.ref, codes };
    },
    async activate(code) {
      const b = (await call(`/tickets/${encodeURIComponent(code)}/activate`, { method: "POST" })) as { activatedAt?: unknown; validUntil?: unknown } | null;
      if (typeof b?.activatedAt !== "string" || typeof b?.validUntil !== "string") throw new TransitProviderError("unavailable");
      return { activatedAt: b.activatedAt, validUntil: b.validUntil };
    },
    async topUp(cardNo, amountSAR, reference) {
      const b = (await call(`/cards/${encodeURIComponent(cardNo)}/topups`, { method: "POST", body: JSON.stringify({ amountSAR, reference }) })) as { ref?: unknown; balanceSAR?: unknown } | null;
      if (typeof b?.ref !== "string") throw new TransitProviderError("rejected");
      return { ref: b.ref, balanceSAR: Number.isFinite(Number(b.balanceSAR)) && b.balanceSAR !== null ? Number(b.balanceSAR) : null };
    },
  };
}

/* -------------------------------------------------------------- sandbox */

/** Sample fares (SAR) — replaced by the operator's products once linked. */
const SANDBOX_PRODUCTS: TransitProduct[] = [
  { id: "2h", nameAr: "تذكرة ساعتين", nameEn: "2-hour ticket", cls: "standard", validityMins: 120, priceSAR: 4, modes: ["metro", "bus"] },
  { id: "2h-first", nameAr: "تذكرة ساعتين — الدرجة الأولى", nameEn: "2-hour ticket — first class", cls: "first", validityMins: 120, priceSAR: 10, modes: ["metro", "bus"] },
  { id: "3d", nameAr: "تذكرة 3 أيام", nameEn: "3-day pass", cls: "standard", validityMins: 3 * 1440, priceSAR: 20, modes: ["metro", "bus"] },
  { id: "7d", nameAr: "تذكرة 7 أيام", nameEn: "7-day pass", cls: "standard", validityMins: 7 * 1440, priceSAR: 40, modes: ["metro", "bus"] },
  { id: "30d", nameAr: "تذكرة 30 يومًا", nameEn: "30-day pass", cls: "standard", validityMins: 30 * 1440, priceSAR: 140, modes: ["metro", "bus"] },
];

const ROAD = 1.3;
const METRO_KMH = 35;
const BUS_KMH = 20;
const WALK_KMH = 4.8;
const HEADWAY = { metro: 6, bus: 15 };
const STATION_KM = 1.2;
const ksaMs = (local: string) => Date.parse(`${local.slice(0, 16)}:00+03:00`);
const toLocal = (ms: number) => new Date(ms + 3 * 3_600_000).toISOString().slice(0, 16);
const walkMin = (km: number) => Math.max(1, Math.round((km * ROAD * 60) / WALK_KMH));
const seed = (s: string) => createHash("sha256").update(s).digest()[0];
/** Next departure at or after `ms` on a line with this headway (minute-aligned, line offset). */
const nextDep = (ms: number, headway: number, key: string) => {
  const min = Math.ceil(ms / 60_000);
  const off = seed(key) % headway;
  return (min + ((((off - min) % headway) + headway) % headway)) * 60_000;
};
const place = (s: MetroStation): TransitPlace => ({ name: s.nameEn, nameAr: s.nameAr, lat: s.lat, lng: s.lng });

/** The two stations farthest apart on a line (its ends), for the direction shown on trains. */
function lineEnds(stations: MetroStation[], line: MetroLineId): [MetroStation, MetroStation] | null {
  const on = stations.filter((s) => s.lines.includes(line));
  let best: [MetroStation, MetroStation] | null = null;
  let d = -1;
  for (const a of on) for (const b of on) {
    const k = distanceKm(a, b);
    if (k > d) [d, best] = [k, [a, b]];
  }
  return best;
}
/** The end of the line beyond the destination: the direction the train shows. */
const towards = (stations: MetroStation[], line: MetroLineId, from: MetroStation, to: MetroStation) => {
  const ends = lineEnds(stations, line);
  if (!ends) return to;
  const score = (e: MetroStation) => distanceKm(e, to) - distanceKm(e, from);
  return score(ends[0]) <= score(ends[1]) ? ends[0] : ends[1];
};

function walkLeg(from: TransitPlace, to: TransitPlace, at: number): JourneyLeg {
  const mins = walkMin(distanceKm(from, to));
  return { mode: "walk", line: null, lineNameAr: null, lineNameEn: null, color: null, from, to, departAt: toLocal(at), arriveAt: toLocal(at + mins * 60_000), mins, stops: 0, headsign: null };
}

function metroRide(stations: MetroStation[], a: MetroStation, b: MetroStation, line: MetroLineId, at: number): JourneyLeg {
  const dep = nextDep(at, HEADWAY.metro, `m${line}${a.id}`);
  const km = distanceKm(a, b) * 1.15;
  const mins = Math.max(2, Math.round((km * 60) / METRO_KMH));
  const between = stations.filter((s) => s.lines.includes(line) && distanceKm(s, a) < distanceKm(a, b) && distanceKm(s, b) < distanceKm(a, b)).length;
  const l = METRO_LINES[line];
  return {
    mode: "metro", line: String(line), lineNameAr: l.nameAr, lineNameEn: l.nameEn, color: l.color, from: place(a), to: place(b),
    departAt: toLocal(dep), arriveAt: toLocal(dep + mins * 60_000), mins: Math.round((dep - at) / 60_000) + mins, stops: between + 1, headsign: towards(stations, line, a, b).nameEn, headsignAr: towards(stations, line, a, b).nameAr,
  };
}

function busRoute(a: TransitPlace, b: TransitPlace) {
  const n = 100 + (createHash("sha256").update(`${a.lat.toFixed(2)}${a.lng.toFixed(2)}${b.lat.toFixed(2)}${b.lng.toFixed(2)}`).digest().readUInt16BE(0) % 900);
  return String(n);
}

function finish(legs: JourneyLeg[], id: string): Journey {
  const departAt = legs[0].departAt;
  const arriveAt = legs[legs.length - 1].arriveAt;
  const rides = legs.filter((l) => l.mode !== "walk").length;
  return {
    id, legs, departAt, arriveAt, mins: Math.round((ksaMs(arriveAt) - ksaMs(departAt)) / 60_000),
    changes: Math.max(0, rides - 1), walkMins: legs.filter((l) => l.mode === "walk").reduce((s, l) => s + l.mins, 0), productId: "2h",
  };
}

/** Walk legs start when the previous leg ends; each ride leaves at its next departure. */
function chain(parts: ((at: number) => JourneyLeg)[], start: number): JourneyLeg[] {
  const out: JourneyLeg[] = [];
  let at = start;
  for (const p of parts) {
    const leg = p(at);
    out.push(leg);
    at = ksaMs(leg.arriveAt);
  }
  return out;
}

export function sandboxJourneys(stations: MetroStation[], from: TransitPlace, to: TransitPlace, departAt: string): Journey[] {
  const start = ksaMs(departAt);
  const near = (p: TransitPlace) => stations.map((s) => ({ s, km: distanceKm(p, s) })).filter((x) => x.km <= STATION_KM).sort((x, y) => x.km - y.km).slice(0, 4);
  const A = near(from);
  const B = near(to);
  const out: Journey[] = [];
  // Direct metro, then one change at an interchange.
  for (const x of A) for (const y of B) {
    if (x.s.id === y.s.id) continue;
    const common = x.s.lines.find((l) => y.s.lines.includes(l));
    if (common) {
      out.push(finish(chain([(t) => walkLeg(from, place(x.s), t), (t) => metroRide(stations, x.s, y.s, common, t), (t) => walkLeg(place(y.s), to, t)], start), ""));
      continue;
    }
    for (const la of x.s.lines) for (const lb of y.s.lines) {
      const hub = stations.filter((s) => s.lines.includes(la) && s.lines.includes(lb) && s.id !== x.s.id && s.id !== y.s.id)
        .sort((p, q) => distanceKm(x.s, p) + distanceKm(p, y.s) - (distanceKm(x.s, q) + distanceKm(q, y.s)))[0];
      if (!hub) continue;
      out.push(finish(chain([(t) => walkLeg(from, place(x.s), t), (t) => metroRide(stations, x.s, hub, la, t), (t) => metroRide(stations, hub, y.s, lb, t + 3 * 60_000), (t) => walkLeg(place(y.s), to, t)], start), ""));
    }
  }
  // A bus: a stop a few minutes' walk away on each side.
  const km = distanceKm(from, to);
  if (km > 1) {
    const route = busRoute(from, to);
    const stopA = { name: `Bus stop — ${from.name}`, nameAr: `موقف حافلات — ${from.nameAr ?? from.name}`, lat: from.lat + 0.002, lng: from.lng };
    const stopB = { name: `Bus stop — ${to.name}`, nameAr: `موقف حافلات — ${to.nameAr ?? to.name}`, lat: to.lat + 0.002, lng: to.lng };
    out.push(finish(chain([
      (t) => walkLeg(from, stopA, t),
      (t) => {
        const dep = nextDep(t, HEADWAY.bus, `b${route}`);
        const mins = Math.max(3, Math.round((km * ROAD * 60) / BUS_KMH));
        return { mode: "bus", line: route, lineNameAr: `حافلة ${route}`, lineNameEn: `Bus ${route}`, color: "#0f766e", from: stopA, to: stopB, departAt: toLocal(dep), arriveAt: toLocal(dep + mins * 60_000), mins: Math.round((dep - t) / 60_000) + mins, stops: Math.max(1, Math.round(km / 0.6)), headsign: to.name, headsignAr: to.nameAr ?? to.name };
      },
      (t) => walkLeg(stopB, to, t),
    ], start), ""));
  }
  const seen = new Set<string>();
  return out
    .sort((a, b) => ksaMs(a.arriveAt) - ksaMs(b.arriveAt) || a.changes - b.changes)
    .filter((j) => {
      const k = j.legs.filter((l) => l.mode !== "walk").map((l) => `${l.line}:${l.from.name}>${l.to.name}`).join("|");
      if (seen.has(k)) return false;
      seen.add(k);
      return true;
    })
    .slice(0, 4)
    .map((j, i) => ({ ...j, id: `j${i + 1}` }));
}

export function sandboxArrivals(stations: MetroStation[], at: { lat: number; lng: number }, now: Date): Arrival[] {
  const ms = now.getTime();
  const out: Arrival[] = [];
  const near = stations.map((s) => ({ s, km: distanceKm(at, s) })).filter((x) => x.km <= 2).sort((x, y) => x.km - y.km).slice(0, 2);
  for (const { s } of near) {
    for (const line of s.lines) {
      const ends = lineEnds(stations, line);
      if (!ends) continue;
      const l = METRO_LINES[line];
      for (const end of ends) {
        if (end.id === s.id) continue;
        for (let k = 0; k < 2; k++) {
          const dep = nextDep(ms + k * HEADWAY.metro * 60_000, HEADWAY.metro, `m${line}${s.id}${end.id}`);
          out.push({ mode: "metro", line: String(line), lineNameAr: l.nameAr, lineNameEn: l.nameEn, color: l.color, headsign: end.nameEn, headsignAr: end.nameAr, stopName: s.nameEn, stopNameAr: s.nameAr, inMins: Math.round((dep - ms) / 60_000), realtime: false });
        }
      }
    }
  }
  const route = busRoute({ name: "", lat: at.lat, lng: at.lng }, { name: "", lat: at.lat + 0.1, lng: at.lng });
  for (let k = 0; k < 2; k++) {
    const dep = nextDep(ms + k * HEADWAY.bus * 60_000, HEADWAY.bus, `b${route}`);
    out.push({ mode: "bus", line: route, lineNameAr: `حافلة ${route}`, lineNameEn: `Bus ${route}`, color: "#0f766e", headsign: near[0]?.s.nameEn ?? "City centre", headsignAr: near[0]?.s.nameAr ?? "وسط المدينة", stopName: "Nearest bus stop", stopNameAr: "أقرب موقف حافلات", inMins: Math.round((dep - ms) / 60_000), realtime: false });
  }
  return out.sort((a, b) => a.inMins - b.inMins).slice(0, 12);
}

function sandboxProvider(): TransitProvider {
  return {
    city: "RUH", nameAr: "النقل العام بالرياض (تجريبي)", nameEn: "Riyadh Public Transport (sample)", sandbox: true,
    features: { metro: true, topUp: true },
    async stops() {
      return (await getMetro()).stations.map((st) => ({ id: st.id, nameAr: st.nameAr, nameEn: st.nameEn, lat: st.lat, lng: st.lng }));
    },
    async lines() {
      return null;
    },
    async plan(from, to, departAt) {
      return sandboxJourneys((await getMetro()).stations, from, to, departAt);
    },
    async arrivals(at, now) {
      return sandboxArrivals((await getMetro()).stations, at, now);
    },
    async products() {
      return SANDBOX_PRODUCTS;
    },
    async buy(r) {
      return { ref: `SBX-TT-${randomBytes(3).toString("hex").toUpperCase()}`, codes: Array.from({ length: r.qty }, () => `RPT${randomBytes(6).toString("hex").toUpperCase()}`) };
    },
    async activate(_code, now, validityMins) {
      return { activatedAt: now.toISOString(), validUntil: new Date(now.getTime() + validityMins * 60_000).toISOString() };
    },
    async topUp(cardNo, amountSAR) {
      const start = 5 + (seed(cardNo) % 20);
      return { ref: `SBX-TU-${randomBytes(3).toString("hex").toUpperCase()}`, balanceSAR: start + amountSAR };
    },
  };
}

/* ------------------------------------------------- sandbox: city buses */

const BUS_HEADWAY = 12;
const CITY_BUS_KMH = 20;
const BUS_PRODUCTS: TransitProduct[] = [
  { id: "2h", nameAr: "تذكرة ساعتين", nameEn: "2-hour ticket", cls: "standard", validityMins: 120, priceSAR: 4, modes: ["bus"] },
  { id: "1d", nameAr: "تذكرة يوم", nameEn: "1-day pass", cls: "standard", validityMins: 1440, priceSAR: 10, modes: ["bus"] },
  { id: "3d", nameAr: "تذكرة 3 أيام", nameEn: "3-day pass", cls: "standard", validityMins: 3 * 1440, priceSAR: 25, modes: ["bus"] },
];
const stopPlace = (st: NetStop): TransitPlace => ({ name: st.nameEn, nameAr: st.nameAr, lat: st.lat, lng: st.lng });
const pathKm = (stops: NetStop[], i: number, j: number) => {
  let km = 0;
  for (let k = Math.min(i, j); k < Math.max(i, j); k++) km += distanceKm(stops[k], stops[k + 1]) * ROAD;
  return km;
};

function busRide(line: NetLine, i: number, j: number, at: number): JourneyLeg {
  const end = j > i ? line.stops[line.stops.length - 1] : line.stops[0];
  const dep = nextDep(at, BUS_HEADWAY, `${line.id}${j > i ? "+" : "-"}${line.stops[i].id}`);
  const mins = Math.max(3, Math.round((pathKm(line.stops, i, j) * 60) / CITY_BUS_KMH) + Math.abs(j - i));
  return {
    mode: "bus", line: line.id, lineNameAr: `${line.id} · ${line.nameAr}`, lineNameEn: `${line.id} · ${line.nameEn}`, color: line.color,
    from: stopPlace(line.stops[i]), to: stopPlace(line.stops[j]), departAt: toLocal(dep), arriveAt: toLocal(dep + mins * 60_000),
    mins: Math.round((dep - at) / 60_000) + mins, stops: Math.abs(j - i), headsign: end.nameEn, headsignAr: end.nameAr,
  };
}

/** Bus journeys on a sample network: one line, or two lines changing at the hub. */
export function busJourneys(net: BusNetwork, from: TransitPlace, to: TransitPlace, departAt: string): Journey[] {
  const start = ksaMs(departAt);
  const stops = allStops(net);
  const near = (p: TransitPlace) => stops.map((st) => ({ st, km: distanceKm(p, st) })).filter((x) => x.km <= STATION_KM).sort((a, b) => a.km - b.km).slice(0, 3);
  const out: Journey[] = [];
  for (const x of near(from)) for (const y of near(to)) {
    if (x.st.id === y.st.id) continue;
    const common = net.lines.find((l) => l.stops.some((q) => q.id === x.st.id) && l.stops.some((q) => q.id === y.st.id));
    if (common) {
      const i = common.stops.findIndex((q) => q.id === x.st.id);
      const j = common.stops.findIndex((q) => q.id === y.st.id);
      out.push(finish(chain([(t) => walkLeg(from, stopPlace(x.st), t), (t) => busRide(common, i, j, t), (t) => walkLeg(stopPlace(y.st), to, t)], start), ""));
      continue;
    }
    const la = net.lines.find((l) => l.stops.some((q) => q.id === x.st.id));
    const lb = net.lines.find((l) => l.stops.some((q) => q.id === y.st.id));
    if (!la || !lb) continue;
    const ia = la.stops.findIndex((q) => q.id === x.st.id);
    const jb = lb.stops.findIndex((q) => q.id === y.st.id);
    out.push(finish(chain([(t) => walkLeg(from, stopPlace(x.st), t), (t) => busRide(la, ia, 0, t), (t) => busRide(lb, 0, jb, t + 3 * 60_000), (t) => walkLeg(stopPlace(y.st), to, t)], start), ""));
  }
  const seen = new Set<string>();
  return out
    .map((j) => ({ ...j, productId: "2h" }))
    .sort((a, b) => ksaMs(a.arriveAt) - ksaMs(b.arriveAt) || a.changes - b.changes)
    .filter((j) => {
      const k = j.legs.filter((l) => l.mode !== "walk").map((l) => `${l.line}:${l.from.name}>${l.to.name}`).join("|");
      if (seen.has(k)) return false;
      seen.add(k);
      return true;
    })
    .slice(0, 4)
    .map((j, i) => ({ ...j, id: `j${i + 1}` }));
}

export function busArrivals(net: BusNetwork, at: { lat: number; lng: number }, now: Date): Arrival[] {
  const ms = now.getTime();
  const out: Arrival[] = [];
  const near = allStops(net).map((st) => ({ st, km: distanceKm(at, st) })).filter((x) => x.km <= 2).sort((a, b) => a.km - b.km).slice(0, 2);
  for (const { st } of near) {
    for (const line of net.lines) {
      const i = line.stops.findIndex((q) => q.id === st.id);
      if (i < 0) continue;
      for (const dir of [1, -1]) {
        const end = dir > 0 ? line.stops[line.stops.length - 1] : line.stops[0];
        if (end.id === st.id) continue;
        for (let k = 0; k < 2; k++) {
          const dep = nextDep(ms + k * BUS_HEADWAY * 60_000, BUS_HEADWAY, `${line.id}${dir > 0 ? "+" : "-"}${st.id}`);
          out.push({ mode: "bus", line: line.id, lineNameAr: `${line.id} · ${line.nameAr}`, lineNameEn: `${line.id} · ${line.nameEn}`, color: line.color, headsign: end.nameEn, headsignAr: end.nameAr, stopName: st.nameEn, stopNameAr: st.nameAr, inMins: Math.round((dep - ms) / 60_000), realtime: false });
        }
      }
    }
  }
  return out.sort((a, b) => a.inMins - b.inMins).slice(0, 12);
}

const CITY_OPERATOR: Record<string, [string, string]> = {
  MKX: ["حافلات مكة (تجريبي)", "Makkah Buses (sample)"],
  MED: ["حافلات المدينة المنورة (تجريبي)", "Madinah Buses (sample)"],
  JED: ["حافلات جدة (تجريبي)", "Jeddah Buses (sample)"],
  DMM: ["حافلات الدمام والخبر (تجريبي)", "Dammam & Khobar Buses (sample)"],
};

function busSandbox(net: BusNetwork): TransitProvider {
  const [nameAr, nameEn] = CITY_OPERATOR[net.city];
  const base = sandboxProvider();
  return {
    city: net.city, nameAr, nameEn, sandbox: true, features: { metro: false, topUp: false },
    async stops() {
      return allStops(net);
    },
    async lines() {
      return net.lines;
    },
    async plan(from, to, departAt) {
      return busJourneys(net, from, to, departAt);
    },
    async arrivals(at, now) {
      return busArrivals(net, at, now);
    },
    async products() {
      return BUS_PRODUCTS;
    },
    buy: base.buy,
    activate: base.activate,
    async topUp() {
      throw new TransitProviderError("rejected");
    },
  };
}

/** The operator of a city: linked by API, else the sandbox (Riyadh). */
export function transitProvider(city: string): TransitProvider | null {
  const c = readConfig().find((p) => p.city.toUpperCase() === city);
  if (c) return apiProvider(c);
  if (!(mtConfig().mock && process.env.DEMO_TRANSIT !== "off")) return null;
  if (city === "RUH") return sandboxProvider();
  return BUS_NETWORKS[city] ? busSandbox(BUS_NETWORKS[city]) : null;
}

const sandboxCities = () => (mtConfig().mock && process.env.DEMO_TRANSIT !== "off" ? ["RUH", ...Object.keys(BUS_NETWORKS)] : []);
export const transitCities = () => [...new Set([...readConfig().map((p) => p.city.toUpperCase()), ...sandboxCities()])];
