/**
 * Sample ratings for sandbox mode (no MT credentials), so the ratings service can be seen at once:
 * - every hotel, airline, event, restaurant, guide place and service shows sample reviews,
 *   generated deterministically (never stored) and labelled as samples;
 * - every traveller can rate a sample trip (TA-DEMO2026): its package, hotel, airline, event,
 *   restaurant, a guide place and two services. Those reviews are stored as samples.
 * Off with DEMO_REVIEWS=off; never shown with live MT credentials.
 */
import { sandboxHotelLicense } from "../agents/mock-data";
import { rng } from "../agents/rng";
import { mtConfig } from "../config";
import { publishedPlaces } from "../guide/repo";
import { listRestaurants } from "../restaurants/catalog";
import { eventsCatalog } from "../events/orders";
import { CRITERIA, type PublicReview, type ReviewableItem, type ReviewTarget } from "./types";

export const demoReviewsEnabled = () => mtConfig().mock && process.env.DEMO_REVIEWS !== "off";

const AUTHORS: [string, string][] = [
  ["Ahmed K.", "EG"], ["Sara M.", "AE"], ["John D.", "GB"], ["Aisha R.", "PK"], ["Mohammed A.", "JO"], ["Emma L.", "FR"],
  ["Omar S.", "MA"], ["Fatima Z.", "ID"], ["Daniel P.", "US"], ["Layla H.", "KW"], ["Yusuf T.", "TR"], ["Priya N.", "IN"],
  ["Khalid B.", "BH"], ["Mei W.", "CN"], ["Hassan I.", "MY"], ["Nour E.", "LB"],
];

/** [Arabic, English] comments by kind and tone. */
type Pair = [string, string];
const GOOD: Record<ReviewTarget, Pair[]> = {
  package: [
    ["رحلة منظمة بالكامل من الطيران حتى الفنادق، وكل شيء كان كما في الحجز.", "A fully organised trip from flights to hotels; everything was exactly as booked."],
    ["التأشيرة صدرت بسرعة والبرنامج اليومي كان متوازنًا ومريحًا للعائلة.", "The visa was issued quickly and the daily programme was balanced and easy for the family."],
    ["قيمة ممتازة مقابل السعر، وخدمة التذكيرات قبل السفر كانت مفيدة جدًا.", "Excellent value, and the reminders before the trip were really helpful."],
  ],
  hotel: [
    ["الغرف نظيفة والموظفون متعاونون، والموقع قريب من المعالم.", "Clean rooms, helpful staff and close to the sights."],
    ["إفطار متنوع وخدمة استقبال سريعة، سأعود إليه بالتأكيد.", "Varied breakfast and fast check-in; I'd definitely stay again."],
    ["فندق هادئ ومريح يطابق تصنيفه تمامًا.", "A quiet, comfortable hotel that fully matches its classification."],
  ],
  airline: [
    ["الرحلة أقلعت في موعدها والطاقم محترف.", "The flight left on time and the crew was professional."],
    ["مقاعد مريحة ووجبة جيدة، وتسليم الأمتعة كان سريعًا.", "Comfortable seats, a good meal and quick baggage delivery."],
  ],
  event: [
    ["تنظيم رائع وتجربة لا تُنسى، والدخول بالرمز كان سهلًا.", "Great organisation and an unforgettable experience; entry with the QR code was easy."],
    ["أجواء مميزة ومناسبة للعائلة، والمقاعد كانت كما اخترناها.", "Wonderful atmosphere for families, and the seats were exactly as chosen."],
    ["يستحق الزيارة، العرض كان احترافيًا.", "Worth it — a very professional show."],
  ],
  restaurant: [
    ["أكل لذيذ وخدمة سريعة، والطاولة كانت جاهزة في موعد الحجز.", "Delicious food and quick service; the table was ready on time."],
    ["أفضل تجربة للمطبخ السعودي خلال رحلتنا.", "The best Saudi cuisine we had on our trip."],
    ["أجواء جميلة وأسعار مناسبة.", "Lovely atmosphere and fair prices."],
  ],
  place: [
    ["مكان رائع للتصوير والتعرف على تاريخ المملكة.", "A wonderful place for photos and to learn about the Kingdom's history."],
    ["مرافق نظيفة ولوحات إرشادية واضحة باللغتين.", "Clean facilities and clear signs in both languages."],
    ["أنصح بزيارته وقت الغروب.", "Best visited at sunset."],
  ],
  service: [
    ["التطبيق سهل وواضح، وأنجزت الحجز كاملًا في دقائق.", "The app is clear and easy; I booked everything in minutes."],
    ["خدمة احترافية ودعم سريع باللغتين.", "Professional service and quick support in both languages."],
    ["كل التفاصيل واضحة قبل الدفع، ولا توجد رسوم مفاجئة.", "Every detail is clear before paying, with no surprise fees."],
  ],
};
const MIXED: Pair[] = [
  ["التجربة جيدة بشكل عام لكن الانتظار كان أطول من المتوقع.", "Good overall, but the wait was longer than expected."],
  ["جيد، ويحتاج إلى تحسين بعض التفاصيل.", "Good, though some details could be improved."],
];
const LOW: Pair[] = [["لم تكن التجربة بمستوى التوقعات، وتواصلت مع الدعم لمعالجة الملاحظة.", "The experience fell short of expectations; I contacted support about it."]];
const REPLY: Pair = ["شكرًا لتقييمك، يسعدنا أن التجربة نالت إعجابك ونتطلع لاستقبالك مجددًا.", "Thank you for your review — we're glad you enjoyed it and look forward to welcoming you again."];

/** Deterministic sample reviews of a target (none stored). */
export function demoReviewsFor(type: ReviewTarget, id: string): PublicReview[] {
  const r = rng(`reviews:${type}:${id}`);
  const n = type === "service" ? r.int(14, 24) : r.int(3, 8);
  const out: PublicReview[] = [];
  const base = Date.parse("2026-09-20T12:00:00Z");
  for (let i = 0; i < n; i++) {
    const roll = r.next();
    const rating = roll < 0.55 ? 5 : roll < 0.85 ? 4 : roll < 0.96 ? 3 : 2;
    const [name, country] = r.pick(AUTHORS);
    const withText = r.next() < 0.75;
    const [ar, en] = rating >= 4 ? r.pick(GOOD[type]) : rating === 3 ? r.pick(MIXED) : r.pick(LOW);
    const lang = r.next() < 0.5 ? "ar" : "en";
    const criteria: Record<string, number> = {};
    for (const c of CRITERIA[type]) if (r.next() < 0.8) criteria[c] = Math.max(1, Math.min(5, rating + (r.next() < 0.3 ? -1 : r.next() < 0.15 ? 1 : 0)));
    const at = new Date(base - r.int(1, 240) * 86_400_000 - r.int(0, 86_399) * 1000).toISOString();
    out.push({
      id: `demo-${type}-${id}-${i}`, targetType: type, targetId: id, targetNameAr: "", targetNameEn: "",
      authorName: name, authorCountry: country, rating, criteria,
      comment: withText ? (lang === "ar" ? ar : en) : "", lang, translation: withText ? { ar, en } : {},
      photos: [],
      reply: withText && r.next() < 0.3 ? { text: lang === "ar" ? REPLY[0] : REPLY[1], at: new Date(Date.parse(at) + 86_400_000).toISOString(), byAr: type === "service" ? "فريق سعودي تريب" : "إدارة المنشأة", byEn: type === "service" ? "Saudi Trip team" : "Management" } : null,
      createdAt: at, demo: true,
    });
  }
  return out;
}

/** The sample trip every traveller can rate in sandbox mode. */
export async function demoReviewableItems(): Promise<ReviewableItem[]> {
  const src = { sourceAr: "رحلة تجريبية TA-DEMO2026", sourceEn: "Sample trip TA-DEMO2026", eligibleAt: "2026-01-01T00:00:00.000Z", demo: true };
  const item = (targetType: ReviewTarget, targetId: string, nameAr: string, nameEn: string): ReviewableItem => ({ key: `demo:${targetType}:${targetId}`, targetType, targetId, nameAr, nameEn, ...src });
  const items = [
    item("package", "demo-trip", "رحلة الرياض والعُلا", "Trip to Riyadh & AlUla"),
    item("hotel", sandboxHotelLicense("RUH", 1), "فندق نجد الكبير", "Najd Grand Hotel"),
    item("airline", "SV", "السعودية", "Saudia"),
  ];
  const restaurant = listRestaurants().find((x) => x.city === "RUH");
  if (restaurant) items.push(item("restaurant", restaurant.id, restaurant.nameAr, restaurant.nameEn));
  const event = (await eventsCatalog()).find((e) => e.id === "ruh-turaif-night-tour") ?? (await eventsCatalog())[0];
  if (event) items.push(item("event", event.id, event.titleAr, event.titleEn));
  const place = (await publishedPlaces("RUH"))[0];
  if (place) items.push(item("place", place.id, place.nameAr, place.nameEn));
  items.push(item("service", "packageVisa", "خدمة الباقات السياحية والتأشيرة", "Tourism package & visa service"));
  items.push(item("service", "planner", "مخطط الرحلة الذكي", "Smart trip planner"));
  return items;
}
