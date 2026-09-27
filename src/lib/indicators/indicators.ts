/**
 * Tourism indicators for the Ministry of Tourism: aggregated and anonymous (no personal data;
 * breakdown counts below 5 are hidden). Computed from bookings, service orders, reviews and
 * accounts over a period of months, optionally for one city.
 */
import type { StoredUser } from "../auth/types";
import type { StoredBooking } from "../bookings/types";
import { mtConfig } from "../config";
import { store } from "../store";
import type { Collection } from "../store/types";

export const MIN_COUNT = 5;
const LIMIT = 200_000;

export interface IndicatorQuery {
  /** YYYY-MM, inclusive. */
  from: string;
  to: string;
  city?: string;
}

export type Count = number | null; // null: hidden (1–4)

export interface Indicators {
  period: { from: string; to: string; city: string | null };
  generatedAt: string;
  sandbox: boolean;
  minCount: number;
  visitors: { bookings: number; travellers: number; visasIssued: number; avgStayNights: number; avgLeadDays: number; avgGroupSize: number; companyShare: number };
  upcoming: { next30: number; next90: number };
  byNationality: { code: string; travellers: Count }[];
  byOrigin: { code: string; bookings: Count }[];
  byCity: { city: string; visitors: Count; nights: Count }[];
  byMonth: { month: string; travellers: number; bookings: number }[];
  hotelStars: { stars: number; stays: Count }[];
  spending: { packagesSAR: number; perTravellerSAR: number; services: { service: string; orders: number; amountSAR: number }[] };
  satisfaction: { reviews: number; avg: number | null; byTarget: { target: string; reviews: Count; avg: number | null }[]; complaints: number };
  accounts: { newAccounts: number; individual: number; company: number; families: number };
}

export const isMonth = (v: unknown): v is string => typeof v === "string" && /^\d{4}-(0[1-9]|1[0-2])$/.test(v);
const hide = (n: number): Count => (n > 0 && n < MIN_COUNT ? null : n);
const round = (n: number, d = 1) => Math.round(n * 10 ** d) / 10 ** d;
const inPeriod = (date: string | undefined, q: IndicatorQuery) => !!date && date.slice(0, 7) >= q.from && date.slice(0, 7) <= q.to;
const active = (b: StoredBooking) => b.status !== "CANCELLED" && b.mt?.packageStatus !== "CANCELLED";
const all = <T>(c: Collection) => store().list<T>(c, LIMIT);

/** Amount of a service order in SAR, whatever its shape. */
function amountOf(o: Record<string, unknown>): number {
  const pick = (v: unknown) => (typeof v === "number" && Number.isFinite(v) ? v : null);
  const nested = (k: string, f: string) => pick((o[k] as Record<string, unknown> | undefined)?.[f]);
  return pick(o.totalSAR) ?? pick(o.amountSAR) ?? nested("payment", "amountSAR") ?? nested("price", "totalSAR") ?? pick(o.priceSAR) ?? pick(o.fareSAR) ?? 0;
}

const SERVICES: { service: string; col: Collection }[] = [
  { service: "events", col: "eventOrders" }, { service: "trains", col: "trainOrders" }, { service: "buses", col: "busOrders" },
  { service: "restaurants", col: "restaurantBookings" }, { service: "esim", col: "esimOrders" }, { service: "rentals", col: "rentals" },
  { service: "transfers", col: "transfers" }, { service: "rides", col: "rides" }, { service: "transit", col: "transitOrders" },
  { service: "guides", col: "guideBookings" }, { service: "umrahPermits", col: "umrahPermits" },
];

function months(q: IndicatorQuery): string[] {
  const out: string[] = [];
  let [y, m] = q.from.split("-").map(Number);
  const [ty, tm] = q.to.split("-").map(Number);
  while ((y < ty || (y === ty && m <= tm)) && out.length < 60) {
    out.push(`${y}-${String(m).padStart(2, "0")}`);
    m++;
    if (m > 12) { m = 1; y++; }
  }
  return out;
}

export async function computeIndicators(q: IndicatorQuery, now = new Date()): Promise<Indicators> {
  const bookingsAll = (await all<StoredBooking>("bookings")).filter(active);
  const bookings = bookingsAll.filter((b) => inPeriod(b.criteria.departureDate, q) && (!q.city || b.criteria.stays.some((s) => s.city === q.city)));
  const travellersOf = (b: StoredBooking) => b.applicants.length || b.criteria.pax.adults + b.criteria.pax.children + b.criteria.pax.infants;
  const travellers = bookings.reduce((n, b) => n + travellersOf(b), 0);
  const nights = bookings.reduce((n, b) => n + b.criteria.stays.reduce((x, s) => x + s.nights, 0), 0);
  const lead = bookings.map((b) => (Date.parse(b.criteria.departureDate) - Date.parse(b.createdAt.slice(0, 10))) / 86_400_000).filter((d) => d >= 0);

  const tally = <K extends string>(pairs: [K, number][]) => {
    const m = new Map<K, number>();
    for (const [k, v] of pairs) m.set(k, (m.get(k) ?? 0) + v);
    return [...m.entries()].sort((a, b) => b[1] - a[1]);
  };

  // Nationalities: of each traveller where known, else the booking's.
  const nat = tally(bookings.flatMap((b) => (b.applicants.length ? b.applicants.map((a): [string, number] => [a.nationality || b.criteria.nationality, 1]) : [[b.criteria.nationality, travellersOf(b)] as [string, number]])));
  const byNationality = nat.slice(0, 20).map(([code, n]) => ({ code, travellers: hide(n) }));
  const byOrigin = tally(bookings.map((b): [string, number] => [b.criteria.origin, 1])).slice(0, 20).map(([code, n]) => ({ code, bookings: hide(n) }));

  // Cities: visitors (travellers staying there) and nights (traveller-nights), for all cities.
  const cityRows = new Map<string, { visitors: number; nights: number }>();
  for (const b of bookingsAll.filter((x) => inPeriod(x.criteria.departureDate, q))) {
    for (const s of b.criteria.stays) {
      const r = cityRows.get(s.city) ?? { visitors: 0, nights: 0 };
      r.visitors += travellersOf(b);
      r.nights += s.nights * travellersOf(b);
      cityRows.set(s.city, r);
    }
  }
  const byCity = [...cityRows.entries()].sort((a, b) => b[1].nights - a[1].nights).map(([city, r]) => ({ city, visitors: hide(r.visitors), nights: hide(r.nights) }));

  const byMonth = months(q).map((month) => {
    const bs = bookings.filter((b) => b.criteria.departureDate.startsWith(month));
    return { month, bookings: bs.length, travellers: bs.reduce((n, b) => n + travellersOf(b), 0) };
  });

  const stars = tally(bookings.flatMap((b) => b.hotels.map((h): [string, number] => [String(h.stars), 1])));
  const hotelStars = [3, 4, 5].map((s) => ({ stars: s, stays: hide(stars.find(([k]) => k === String(s))?.[1] ?? 0) }));

  const today = now.toISOString().slice(0, 10);
  const inDays = (d: number) => new Date(now.getTime() + d * 86_400_000).toISOString().slice(0, 10);
  const upcomingIn = (d: number) => bookingsAll.filter((b) => b.criteria.departureDate >= today && b.criteria.departureDate <= inDays(d) && (!q.city || b.criteria.stays.some((s) => s.city === q.city))).reduce((n, b) => n + travellersOf(b), 0);

  const packagesSAR = bookings.reduce((n, b) => n + (b.price?.totalSAR ?? 0), 0);
  const services = await Promise.all(SERVICES.map(async ({ service, col }) => {
    const rows = (await all<Record<string, unknown>>(col)).filter((o) => inPeriod(String(o.createdAt ?? ""), q) && !/CANCEL/i.test(String(o.status ?? "")) && (!q.city || !o.city || o.city === q.city));
    return { service, orders: rows.length, amountSAR: round(rows.reduce((n, o) => n + amountOf(o), 0), 2) };
  }));

  const reviews = (await all<{ rating: number; targetType: string; createdAt: string; status?: string; demo?: boolean }>("reviews"))
    .filter((r) => inPeriod(r.createdAt, q) && r.status !== "rejected" && typeof r.rating === "number");
  const avg = (rs: { rating: number }[]) => (rs.length ? round(rs.reduce((n, r) => n + r.rating, 0) / rs.length, 2) : null);
  const targets = [...new Set(reviews.map((r) => r.targetType))];
  const complaints = (await all<{ category?: string; createdAt: string }>("supportTickets")).filter((t) => t.category === "complaint" && inPeriod(t.createdAt, q)).length;

  const users = (await all<StoredUser>("users")).filter((u) => !u.deletedAt && inPeriod(u.createdAt, q));
  const families = (await all<{ createdAt: string }>("families")).filter((f) => inPeriod(f.createdAt, q)).length;

  return {
    period: { from: q.from, to: q.to, city: q.city ?? null },
    generatedAt: now.toISOString(),
    sandbox: mtConfig().mock,
    minCount: MIN_COUNT,
    visitors: {
      bookings: bookings.length, travellers,
      visasIssued: bookings.reduce((n, b) => n + b.applicants.filter((a) => a.visaNumber).length, 0),
      avgStayNights: bookings.length ? round(nights / bookings.length) : 0,
      avgLeadDays: lead.length ? Math.round(lead.reduce((a, b) => a + b, 0) / lead.length) : 0,
      avgGroupSize: bookings.length ? round(travellers / bookings.length) : 0,
      companyShare: bookings.length ? round((bookings.filter((b) => b.accountType === "company").length / bookings.length) * 100) : 0,
    },
    upcoming: { next30: upcomingIn(30), next90: upcomingIn(90) },
    byNationality, byOrigin, byCity, byMonth, hotelStars,
    spending: { packagesSAR: round(packagesSAR, 2), perTravellerSAR: travellers ? Math.round(packagesSAR / travellers) : 0, services },
    satisfaction: {
      reviews: reviews.length, avg: avg(reviews), complaints,
      byTarget: targets.map((t) => {
        const rs = reviews.filter((r) => r.targetType === t);
        return { target: t, reviews: hide(rs.length), avg: rs.length >= MIN_COUNT ? avg(rs) : null };
      }).sort((a, b) => (b.reviews ?? 0) - (a.reviews ?? 0)),
    },
    accounts: { newAccounts: users.length, individual: users.filter((u) => u.accountType === "individual").length, company: users.filter((u) => u.accountType === "company").length, families },
  };
}

const cache = new Map<string, { at: number; data: Indicators }>();
/** Cached for 10 minutes per query. */
export async function indicators(q: IndicatorQuery, now = new Date()): Promise<Indicators> {
  const key = `${q.from}|${q.to}|${q.city ?? ""}`;
  const hit = cache.get(key);
  if (hit && now.getTime() - hit.at < 10 * 60_000) return hit.data;
  const data = await computeIndicators(q, now);
  cache.set(key, { at: now.getTime(), data });
  return data;
}
export const clearIndicatorsCache = () => cache.clear();

/** Flat CSV (section, key, value) for spreadsheets and data platforms. */
export function toCsv(d: Indicators): string {
  const rows: (string | number | null)[][] = [["section", "key", "metric", "value"]];
  const v = (x: Count | number | null) => (x === null ? `<${MIN_COUNT}` : x);
  rows.push(["period", "from", "", d.period.from], ["period", "to", "", d.period.to], ["period", "city", "", d.period.city ?? "all"]);
  for (const [k, x] of Object.entries(d.visitors)) rows.push(["visitors", k, "", x]);
  for (const [k, x] of Object.entries(d.upcoming)) rows.push(["upcoming", k, "travellers", x]);
  for (const r of d.byNationality) rows.push(["nationality", r.code, "travellers", v(r.travellers)]);
  for (const r of d.byOrigin) rows.push(["origin", r.code, "bookings", v(r.bookings)]);
  for (const r of d.byCity) rows.push(["city", r.city, "visitors", v(r.visitors)], ["city", r.city, "nights", v(r.nights)]);
  for (const r of d.byMonth) rows.push(["month", r.month, "travellers", r.travellers], ["month", r.month, "bookings", r.bookings]);
  for (const r of d.hotelStars) rows.push(["hotelStars", String(r.stars), "stays", v(r.stays)]);
  rows.push(["spending", "packages", "SAR", d.spending.packagesSAR], ["spending", "perTraveller", "SAR", d.spending.perTravellerSAR]);
  for (const r of d.spending.services) rows.push(["services", r.service, "orders", r.orders], ["services", r.service, "SAR", r.amountSAR]);
  rows.push(["satisfaction", "all", "reviews", d.satisfaction.reviews], ["satisfaction", "all", "avg", d.satisfaction.avg], ["satisfaction", "complaints", "tickets", d.satisfaction.complaints]);
  for (const r of d.satisfaction.byTarget) rows.push(["satisfaction", r.target, "reviews", v(r.reviews)], ["satisfaction", r.target, "avg", r.avg]);
  for (const [k, x] of Object.entries(d.accounts)) rows.push(["accounts", k, "", x]);
  const esc = (x: string | number | null) => {
    const s = x === null ? "" : String(x);
    return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  return rows.map((r) => r.map(esc).join(",")).join("\n");
}
