/**
 * Events provider adapter (webook.com for events, MyTable for dining experiences).
 *
 * Until the provider APIs are connected the sandbox catalogue below is served: realistic events
 * with sessions generated from each event's schedule (inside its season's dates), seat maps and
 * general admission tickets, part of them already sold. When the APIs are connected, this module
 * is the only place to change: list events, seat availability, purchase and cancel.
 */
import { createHash, randomBytes } from "node:crypto";
import type { EventCategory, EventItem, EventProviderId, EventSession, RefundPolicy, Season, SeatSection, TicketType } from "./types";

interface Schedule {
  /** 0 = Sunday … 6 = Saturday. */
  days: number[];
  /** Saudi local times, HH:MM. */
  times: string[];
}

type Def = Omit<EventItem, "sessions" | "provider" | "maxPerOrder"> & { provider?: EventProviderId; schedule: Schedule; maxPerOrder?: number };

const EVERY_DAY = [0, 1, 2, 3, 4, 5, 6];
const WEEKEND = [4, 5, 6];
const nonRefundable: RefundPolicy = { refundable: false, cutoffHours: 0 };
const refundable = (cutoffHours: number): RefundPolicy => ({ refundable: true, cutoffHours });
const sec = (id: string, nameAr: string, nameEn: string, priceSAR: number, rows: number, seatsPerRow: number): SeatSection => ({ id, nameAr, nameEn, priceSAR, rows, seatsPerRow });
const ga = (id: string, nameAr: string, nameEn: string, priceSAR: number, capacity: number): TicketType => ({ id, nameAr, nameEn, priceSAR, capacity });
const ev = (d: Omit<Def, "descriptionAr" | "descriptionEn"> & { descriptionAr: string; descriptionEn: string }) => d;

const DEFS: Def[] = [
  // Riyadh
  ev({ id: "ruh-boulevard-concert", seasonId: "riyadh-season", city: "RUH", category: "concert", titleAr: "ليلة طرب في البوليفارد", titleEn: "Boulevard Arabic Music Night", descriptionAr: "أمسية طربية بمشاركة نخبة من الفنانين وفرقة موسيقية كاملة.", descriptionEn: "An evening of classic Arabic music with leading artists and a full orchestra.", venueAr: "محمد عبده أرينا — بوليفارد رياض سيتي", venueEn: "Mohammed Abdu Arena — Boulevard Riyadh City", lat: 24.7676, lng: 46.6022, durationMins: 180, seating: "seated", sections: [sec("plat", "بلاتيني", "Platinum", 1200, 3, 12), sec("gold", "ذهبي", "Gold", 750, 5, 14), sec("silver", "فضي", "Silver", 450, 6, 16)], refund: nonRefundable, schedule: { days: [4, 5], times: ["21:00"] } }),
  ev({ id: "ruh-boulevard-entry", seasonId: "riyadh-season", city: "RUH", category: "family", titleAr: "دخول بوليفارد رياض سيتي", titleEn: "Boulevard Riyadh City Entry", descriptionAr: "تذكرة دخول المنطقة الترفيهية: عروض حية، مطاعم، ألعاب وأنشطة للعائلة.", descriptionEn: "Entry to the entertainment zone: live shows, restaurants, games and family activities.", venueAr: "بوليفارد رياض سيتي", venueEn: "Boulevard Riyadh City", lat: 24.7686, lng: 46.6013, durationMins: 240, seating: "general", ticketTypes: [ga("adult", "بالغ", "Adult", 50, 3000), ga("child", "طفل (3–12)", "Child (3–12)", 25, 1500)], refund: refundable(24), schedule: { days: EVERY_DAY, times: ["16:00"] } }),
  ev({ id: "ruh-fight-night", seasonId: "riyadh-season", city: "RUH", category: "sports", titleAr: "ليلة النزالات الكبرى", titleEn: "Big Fight Night", descriptionAr: "بطاقة نزالات ملاكمة دولية على لقب عالمي.", descriptionEn: "An international boxing card headlined by a world-title fight.", venueAr: "المملكة أرينا", venueEn: "Kingdom Arena", lat: 24.7572, lng: 46.6395, durationMins: 240, seating: "seated", sections: [sec("ring", "بجوار الحلبة", "Ringside", 2500, 2, 10), sec("lower", "المدرج السفلي", "Lower tier", 900, 5, 16), sec("upper", "المدرج العلوي", "Upper tier", 350, 7, 18)], refund: nonRefundable, schedule: { days: [6], times: ["20:00"] }, maxPerOrder: 6 }),
  ev({ id: "ruh-comedy-show", seasonId: "riyadh-season", city: "RUH", category: "theatre", titleAr: "عرض كوميدي — مسرح البوليفارد", titleEn: "Comedy Show — Boulevard Theatre", descriptionAr: "عرض مسرحي كوميدي عائلي باللغة العربية.", descriptionEn: "A family comedy stage show in Arabic.", venueAr: "مسرح بوليفارد سيتي", venueEn: "Boulevard City Theatre", lat: 24.769, lng: 46.603, durationMins: 120, seating: "seated", sections: [sec("vip", "كبار الشخصيات", "VIP", 400, 3, 12), sec("reg", "عادي", "Regular", 220, 8, 16)], refund: refundable(48), schedule: { days: [3, 4], times: ["21:30"] } }),
  ev({ id: "ruh-turaif-night-tour", seasonId: "diriyah-season", city: "RUH", category: "culture", titleAr: "جولة الطريف الليلية", titleEn: "At-Turaif Night Tour", descriptionAr: "جولة مسائية بصحبة مرشد في حي الطريف التاريخي مع عرض ضوئي.", descriptionEn: "A guided evening tour of At-Turaif with a light show.", venueAr: "حي الطريف — الدرعية", venueEn: "At-Turaif District, Diriyah", lat: 24.7336, lng: 46.5753, durationMins: 90, seating: "general", ticketTypes: [ga("adult", "بالغ", "Adult", 150, 120), ga("child", "طفل (6–12)", "Child (6–12)", 75, 60)], refund: refundable(24), schedule: { days: EVERY_DAY, times: ["19:00"] } }),
  ev({ id: "ruh-bujairi-chef-dinner", seasonId: "diriyah-season", provider: "mytable", city: "RUH", category: "dining", titleAr: "عشاء الشيف في مطل البجيري", titleEn: "Chef's Table Dinner at Bujairi", descriptionAr: "قائمة تذوق من سبعة أطباق مستوحاة من المطبخ النجدي.", descriptionEn: "A seven-course tasting menu inspired by Najdi cuisine.", venueAr: "مطل البجيري — الدرعية", venueEn: "Bujairi Terrace, Diriyah", lat: 24.7353, lng: 46.577, durationMins: 150, seating: "general", ticketTypes: [ga("menu", "قائمة التذوق", "Tasting menu", 650, 30)], refund: refundable(48), schedule: { days: [5, 6], times: ["20:00"] }, maxPerOrder: 8 }),
  ev({ id: "ruh-edge-sunset", seasonId: null, city: "RUH", category: "adventure", titleAr: "غروب حافة العالم", titleEn: "Edge of the World Sunset Trip", descriptionAr: "رحلة بسيارات دفع رباعي مع مرشد إلى منحدرات طويق وعشاء خفيف عند الغروب.", descriptionEn: "A guided 4x4 trip to the Tuwaiq cliffs with a light dinner at sunset.", venueAr: "حافة العالم", venueEn: "Edge of the World", lat: 24.9538, lng: 45.9917, durationMins: 360, seating: "general", ticketTypes: [ga("seat", "مقعد في الرحلة", "Seat on the trip", 350, 40)], refund: refundable(72), schedule: { days: [5, 6], times: ["14:00"] } }),
  ev({ id: "ruh-league-match", seasonId: null, city: "RUH", category: "sports", titleAr: "مباراة دوري روشن السعودي", titleEn: "Saudi Pro League Match", descriptionAr: "مباراة في دوري روشن للمحترفين.", descriptionEn: "A Roshn Saudi League fixture.", venueAr: "استاد الملك فهد الدولي", venueEn: "King Fahd International Stadium", lat: 24.7892, lng: 46.8397, durationMins: 120, seating: "seated", sections: [sec("prem", "المنصة", "Premium", 300, 3, 14), sec("lower", "المدرج السفلي", "Lower tier", 120, 6, 18), sec("upper", "المدرج العلوي", "Upper tier", 60, 8, 20)], refund: nonRefundable, schedule: { days: [5], times: ["20:30"] } }),
  // Jeddah
  ev({ id: "jed-sunset-cruise", seasonId: "jeddah-season", city: "JED", category: "adventure", titleAr: "رحلة الغروب البحرية", titleEn: "Red Sea Sunset Cruise", descriptionAr: "رحلة بحرية ساعتين على يخت مع مشروبات ووجبات خفيفة.", descriptionEn: "A two-hour yacht cruise with drinks and snacks.", venueAr: "مرسى أبحر", venueEn: "Obhur Marina", lat: 21.7272, lng: 39.0972, durationMins: 120, seating: "general", ticketTypes: [ga("adult", "بالغ", "Adult", 320, 40), ga("child", "طفل (3–12)", "Child (3–12)", 160, 20)], refund: refundable(24), schedule: { days: EVERY_DAY, times: ["17:00"] } }),
  ev({ id: "jed-waterfront-concert", seasonId: "jeddah-season", city: "JED", category: "concert", titleAr: "حفل الواجهة البحرية", titleEn: "Waterfront Concert", descriptionAr: "حفل غنائي في الهواء الطلق على الواجهة البحرية.", descriptionEn: "An open-air concert on the waterfront.", venueAr: "مسرح الواجهة البحرية بجدة", venueEn: "Jeddah Waterfront Stage", lat: 21.595, lng: 39.107, durationMins: 180, seating: "seated", sections: [sec("front", "الصفوف الأمامية", "Front rows", 850, 3, 14), sec("mid", "الوسط", "Middle", 500, 5, 16), sec("back", "الخلف", "Back", 250, 6, 18)], refund: nonRefundable, schedule: { days: [4, 5], times: ["21:00"] } }),
  ev({ id: "jed-albalad-walk", seasonId: null, city: "JED", category: "culture", titleAr: "جولة جدة التاريخية", titleEn: "Historic Jeddah Walking Tour", descriptionAr: "جولة مشي مع مرشد بين بيوت البلد وأسواقها ومساجدها التاريخية.", descriptionEn: "A guided walk through Al-Balad's houses, souqs and historic mosques.", venueAr: "باب مكة — جدة التاريخية", venueEn: "Bab Makkah, Al-Balad", lat: 21.4833, lng: 39.1906, durationMins: 120, seating: "general", ticketTypes: [ga("adult", "بالغ", "Adult", 90, 25), ga("child", "طفل (6–12)", "Child (6–12)", 45, 10)], refund: refundable(24), schedule: { days: WEEKEND, times: ["17:00"] } }),
  ev({ id: "jed-diving", seasonId: null, city: "JED", category: "adventure", titleAr: "تجربة غوص في البحر الأحمر", titleEn: "Red Sea Discovery Dive", descriptionAr: "غوص تجريبي مع مدرب معتمد، يشمل المعدات والنقل البحري.", descriptionEn: "A discovery dive with a certified instructor, equipment and boat included.", venueAr: "شرم أبحر", venueEn: "Sharm Obhur", lat: 21.705, lng: 39.1, durationMins: 240, minAge: 12, seating: "general", ticketTypes: [ga("dive", "غوص تجريبي", "Discovery dive", 450, 12)], refund: refundable(48), schedule: { days: [5, 6], times: ["08:00"] }, maxPerOrder: 6 }),
  ev({ id: "jed-seafood-dinner", seasonId: null, provider: "mytable", city: "JED", category: "dining", titleAr: "عشاء المأكولات البحرية على الكورنيش", titleEn: "Corniche Seafood Dinner", descriptionAr: "حجز طاولة مع قائمة مأكولات بحرية طازجة من صيد اليوم.", descriptionEn: "A table booking with a set menu of the day's fresh catch.", venueAr: "كورنيش جدة", venueEn: "Jeddah Corniche", lat: 21.56, lng: 39.12, durationMins: 120, seating: "general", ticketTypes: [ga("menu", "قائمة المأكولات البحرية", "Seafood set menu", 280, 40)], refund: refundable(12), schedule: { days: EVERY_DAY, times: ["20:00"] }, maxPerOrder: 10 }),
  // AlUla
  ev({ id: "ulh-maraya-concert", seasonId: "winter-at-tantora", city: "ULH", category: "concert", titleAr: "حفل مرايا", titleEn: "Concert at Maraya", descriptionAr: "حفل موسيقي في أكبر مبنى مغطى بالمرايا في العالم.", descriptionEn: "A concert inside the world's largest mirrored building.", venueAr: "مرايا — العُلا", venueEn: "Maraya, AlUla", lat: 26.6392, lng: 37.887, durationMins: 150, seating: "seated", sections: [sec("front", "الأمامي", "Front", 1500, 3, 12), sec("mid", "الوسط", "Middle", 900, 4, 14), sec("back", "الخلفي", "Back", 500, 5, 14)], refund: nonRefundable, schedule: { days: [5], times: ["20:30"] } }),
  ev({ id: "ulh-balloon", seasonId: "winter-at-tantora", city: "ULH", category: "adventure", titleAr: "رحلة منطاد فوق العُلا", titleEn: "Hot-Air Balloon over AlUla", descriptionAr: "رحلة شروق بالمنطاد فوق الجبال والوديان.", descriptionEn: "A sunrise balloon flight over the mountains and valleys.", venueAr: "موقع إطلاق المناطيد — العُلا", venueEn: "AlUla balloon launch site", lat: 26.67, lng: 37.93, durationMins: 180, minAge: 8, seating: "general", ticketTypes: [ga("seat", "مقعد في المنطاد", "Balloon seat", 1250, 16)], refund: refundable(48), schedule: { days: EVERY_DAY, times: ["06:00"] }, maxPerOrder: 6 }),
  ev({ id: "ulh-hegra-tour", seasonId: null, city: "ULH", category: "culture", titleAr: "جولة الحِجر بصحبة راوٍ", titleEn: "Hegra Guided Tour", descriptionAr: "جولة بالحافلة مع راوٍ محلي بين المقابر النبطية.", descriptionEn: "A bus tour with a local storyteller among the Nabataean tombs.", venueAr: "الحِجر — مركز الزوار", venueEn: "Hegra visitor centre", lat: 26.7917, lng: 37.9533, durationMins: 150, seating: "general", ticketTypes: [ga("adult", "بالغ", "Adult", 95, 45), ga("child", "طفل (6–12)", "Child (6–12)", 50, 20)], refund: refundable(24), schedule: { days: EVERY_DAY, times: ["09:00", "15:00"] } }),
  ev({ id: "ulh-stargazing", seasonId: null, city: "ULH", category: "adventure", titleAr: "ليلة رصد النجوم", titleEn: "Stargazing Night", descriptionAr: "جلسة رصد فلكي بالتلسكوبات في الصحراء مع مشروبات ساخنة.", descriptionEn: "Telescope stargazing in the desert with hot drinks.", venueAr: "صحراء العُلا", venueEn: "AlUla desert", lat: 26.58, lng: 37.98, durationMins: 120, seating: "general", ticketTypes: [ga("adult", "بالغ", "Adult", 220, 30)], refund: refundable(24), schedule: { days: WEEKEND, times: ["20:00"] } }),
  // Eastern Province
  ev({ id: "dmm-corniche-festival", seasonId: "sharqiah-season", city: "DMM", category: "family", titleAr: "مهرجان الكورنيش العائلي", titleEn: "Corniche Family Festival", descriptionAr: "عروض حية وألعاب ومأكولات على كورنيش الخبر.", descriptionEn: "Live shows, games and food on the Al Khobar Corniche.", venueAr: "كورنيش الخبر", venueEn: "Al Khobar Corniche", lat: 26.295, lng: 50.22, durationMins: 240, seating: "general", ticketTypes: [ga("entry", "دخول", "Entry", 40, 2000)], refund: refundable(24), schedule: { days: WEEKEND, times: ["16:00"] } }),
  ev({ id: "dmm-ithra-show", seasonId: null, city: "DMM", category: "theatre", titleAr: "عرض مسرحي في إثراء", titleEn: "Stage Show at Ithra", descriptionAr: "عرض مسرحي موسيقي على مسرح إثراء.", descriptionEn: "A musical stage production at the Ithra theatre.", venueAr: "مسرح إثراء", venueEn: "Ithra Theatre", lat: 26.3328, lng: 50.1177, durationMins: 120, seating: "seated", sections: [sec("orch", "الصالة", "Orchestra", 250, 6, 16), sec("balc", "الشرفة", "Balcony", 150, 4, 18)], refund: refundable(48), schedule: { days: [3, 4], times: ["20:00"] } }),
  // Abha & Taif
  ev({ id: "ahb-soudah-zipline", seasonId: null, city: "AHB", category: "adventure", titleAr: "التلفريك والانزلاق في السودة", titleEn: "Al Soudah Cable Car & Zipline", descriptionAr: "رحلة تلفريك بين القمم وتجربة انزلاق معلق.", descriptionEn: "A cable-car ride between the peaks and a zipline run.", venueAr: "منتزه السودة", venueEn: "Al Soudah Park", lat: 18.27, lng: 42.37, durationMins: 150, minAge: 10, seating: "general", ticketTypes: [ga("adult", "بالغ", "Adult", 180, 60)], refund: refundable(24), schedule: { days: EVERY_DAY, times: ["10:00"] } }),
  ev({ id: "tif-rose-farm", seasonId: null, city: "TIF", category: "culture", titleAr: "تجربة مزرعة الورد الطائفي", titleEn: "Taif Rose Farm Experience", descriptionAr: "زيارة مزرعة ورد ومصنع تقطير مع ورشة صنع العطر.", descriptionEn: "A rose farm and distillery visit with a perfume-making workshop.", venueAr: "مزارع الورد — الهدا", venueEn: "Rose farms, Al Hada", lat: 21.36, lng: 40.29, durationMins: 150, seating: "general", ticketTypes: [ga("adult", "بالغ", "Adult", 120, 30), ga("child", "طفل (6–12)", "Child (6–12)", 60, 15)], refund: refundable(24), schedule: { days: [5, 6], times: ["09:00"] } }),
];

const DEFAULT_WINDOW_DAYS = 90;
const MAX_WINDOW_DAYS = 300;
const MAX_SESSIONS = 40;

const addDays = (iso: string, n: number) => new Date(Date.parse(`${iso}T00:00:00Z`) + n * 86_400_000).toISOString().slice(0, 10);
const weekday = (iso: string) => new Date(`${iso}T00:00:00Z`).getUTCDay();

/** Sessions from the schedule, from tomorrow, inside the season (or the next 90 days). */
function sessionsFor(def: Def, season: Season | undefined, today: string): EventSession[] {
  const from = season && season.startDate > today ? season.startDate : addDays(today, 1);
  const to = season ? [season.endDate, addDays(today, MAX_WINDOW_DAYS)].sort()[0] : addDays(today, DEFAULT_WINDOW_DAYS);
  const out: EventSession[] = [];
  for (let d = from; d <= to && out.length < MAX_SESSIONS; d = addDays(d, 1)) {
    if (!def.schedule.days.includes(weekday(d))) continue;
    for (const time of def.schedule.times) {
      out.push({ id: `${def.id}-${d.replace(/-/g, "")}${time.replace(":", "")}`, start: new Date(`${d}T${time}:00+03:00`).toISOString() });
    }
  }
  return out;
}

/**
 * The catalogue: events with upcoming sessions. Events of a hidden or removed season are not
 * offered (the season is the provider's grouping).
 */
export function listCatalog(seasons: Season[], today: string): EventItem[] {
  const byId = new Map(seasons.map((s) => [s.id, s]));
  const out: EventItem[] = [];
  for (const def of DEFS) {
    const season = def.seasonId ? byId.get(def.seasonId) : undefined;
    if (def.seasonId && (!season || season.status !== "published")) continue;
    const sessions = sessionsFor(def, season, today);
    if (!sessions.length) continue;
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const { schedule, provider, maxPerOrder, ...rest } = def;
    out.push({ ...rest, provider: provider ?? "webook", maxPerOrder: maxPerOrder ?? 10, sessions });
  }
  return out;
}

/** Session id → event id and date, for sessions of events known to the catalogue. */
export const eventIdOfSession = (sessionId: string) => DEFS.find((d) => sessionId.startsWith(`${d.id}-`))?.id ?? null;

/* ------------------------------------------------------ availability */

const unit = (s: string) => createHash("sha256").update(s).digest().readUInt32BE(0) / 0xffffffff;

export const rowLetter = (i: number) => String.fromCharCode(65 + i);
export const seatId = (sectionId: string, row: number, n: number) => `${sectionId}-${rowLetter(row)}${n}`;

/** Seats the provider has already sold through other channels (sandbox: about a third). */
export function providerSoldSeat(sessionId: string, seat: string): boolean {
  return unit(`${sessionId}|${seat}`) < 0.32;
}

/** General admission tickets already sold through other channels. */
export function providerSoldCount(sessionId: string, t: TicketType): number {
  return Math.floor(t.capacity * (0.2 + 0.5 * unit(`${sessionId}|${t.id}`)));
}

export function isKnownSeat(e: EventItem, seat: string): SeatSection | null {
  const m = /^([a-z]+)-([A-Z])(\d+)$/.exec(seat);
  if (!m) return null;
  const s = e.sections?.find((x) => x.id === m[1]);
  if (!s) return null;
  const row = m[2].charCodeAt(0) - 65;
  const n = Number(m[3]);
  return row >= 0 && row < s.rows && n >= 1 && n <= s.seatsPerRow ? s : null;
}

/* ------------------------------------------------------ purchase */

export const eventsProviderMode = () => "sandbox" as const;

/** Issues the tickets with the provider (sandbox: reference and QR codes generated here). */
export async function providerPurchase(e: EventItem, count: number): Promise<{ providerRef: string; codes: string[] }> {
  const prefix = e.provider === "mytable" ? "MT" : "WB";
  const code = () => `${prefix}-${randomBytes(6).toString("hex").toUpperCase()}`;
  return { providerRef: code(), codes: Array.from({ length: count }, code) };
}

export async function providerCancel(providerRef: string): Promise<boolean> {
  return !!providerRef;
}

export type { EventCategory };
