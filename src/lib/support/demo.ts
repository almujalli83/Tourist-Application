/**
 * Sample support tickets for sandbox mode (no MT credentials), so the service can be seen at once:
 * three tickets from sample travellers (English, French, Urdu) in the back-office queue, and a
 * sample conversation in every traveller's support page. Off with DEMO_SUPPORT=off.
 */
import { randomUUID } from "node:crypto";
import type { Lang } from "../assistant/translate";
import type { PublicUser } from "../auth/types";
import { mtConfig } from "../config";
import { store } from "../store";
import type { StoredTicket } from "./tickets";
import type { SupportCategory, TicketPriority, TicketStatus } from "./types";

const COL = "supportTickets" as const;
export const demoSupportEnabled = () => mtConfig().mock && process.env.DEMO_SUPPORT !== "off";

type Msg = { from: "traveller" | "staff"; text: string; lang: Lang; tr: string | null; minutes: number };

function ticket(id: string, number: string, o: { userId: string; userName: string; userEmail: string; nationality: string; lang: Lang; subject: string; category: SupportCategory; status: TicketStatus; priority: TicketPriority; msgs: Msg[] }, now: Date): StoredTicket {
  const at = (m: number) => new Date(now.getTime() - m * 60_000).toISOString();
  const messages = o.msgs.map((m) => ({
    id: randomUUID(), from: m.from, author: m.from === "staff" ? "فريق الدعم" : null, at: at(m.minutes), text: m.text, lang: m.lang,
    translation: m.tr ? { lang: m.from === "traveller" ? ("ar" as Lang) : o.lang, text: m.tr } : null, attachments: [],
  }));
  return {
    id, number, subject: o.subject, category: o.category, status: o.status, priority: o.priority, lang: o.lang, booking: null,
    createdAt: messages[0].at, updatedAt: messages[messages.length - 1].at, assignedTo: null, messages,
    userId: o.userId, userName: o.userName, userEmail: o.userEmail, nationality: o.nationality, closedAt: o.status === "closed" ? messages[messages.length - 1].at : null, demo: true,
  };
}

/** The back-office samples (once). */
export async function seedSupportQueue(now = new Date()): Promise<void> {
  if (!demoSupportEnabled()) return;
  if (!(await store().insert("config", "supportDemo:v1", { id: "supportDemo:v1", at: now.toISOString() }))) return;
  const rows = [
    ticket("demo-queue-1", "SUP-0901", {
      userId: "demo-traveller-1", userName: "John Davies", userEmail: "john.davies@example.com", nationality: "GB", lang: "en",
      subject: "Visa not showing in my wallet", category: "visa", status: "open", priority: "high",
      msgs: [{ from: "traveller", lang: "en", minutes: 35, text: "Hello, I paid for my package yesterday and my flight is tomorrow morning, but I can't see the visa in my wallet. Could you please check?", tr: "مرحبًا، دفعت قيمة الباقة أمس ورحلتي صباح الغد، لكني لا أرى التأشيرة في محفظتي. هل يمكنكم التحقق من فضلكم؟" }],
    }, now),
    ticket("demo-queue-2", "SUP-0902", {
      userId: "demo-traveller-2", userName: "Camille Martin", userEmail: "camille.martin@example.com", nationality: "FR", lang: "fr",
      subject: "Changer l'heure de ma réservation au restaurant", category: "restaurants", status: "open", priority: "normal",
      msgs: [{ from: "traveller", lang: "fr", minutes: 90, text: "Bonjour, est-il possible de décaler ma réservation au restaurant de 20h à 21h30 ? Merci beaucoup.", tr: "مرحبًا، هل يمكن تأخير حجزي في المطعم من الساعة 8 مساءً إلى 9:30 مساءً؟ شكرًا جزيلًا." }],
    }, now),
    ticket("demo-queue-3", "SUP-0903", {
      userId: "demo-traveller-3", userName: "Ayesha Khan", userEmail: "ayesha.khan@example.com", nationality: "PK", lang: "ur",
      subject: "eSIM انسٹال نہیں ہو رہی", category: "esim", status: "waiting", priority: "normal",
      msgs: [
        { from: "traveller", lang: "ur", minutes: 240, text: "السلام علیکم، میری eSIM انسٹال نہیں ہو رہی۔ QR کوڈ اسکین کرنے پر خرابی آتی ہے۔", tr: "السلام عليكم، شريحة eSIM لا تُثبَّت. عند مسح رمز QR يظهر خطأ." },
        { from: "staff", lang: "ar", minutes: 200, text: "وعليكم السلام، نأسف لذلك. تأكدي من اتصال الجوال بشبكة Wi-Fi ثم جرّبي «التثبيت المباشر» من صفحة الشريحة في «حجوزاتي». هل ظهرت رسالة خطأ معيّنة؟", tr: "وعلیکم السلام، ہمیں افسوس ہے۔ یقینی بنائیں کہ فون Wi-Fi سے جڑا ہے، پھر «میری بکنگز» میں eSIM صفحے سے «براہ راست انسٹال» آزمائیں۔ کیا کوئی خاص خرابی کا پیغام آیا؟" },
      ],
    }, now),
  ];
  for (const r of rows) await store().insert(COL, r.id, r);
}

/** A sample conversation in the traveller's own support page (once per traveller). */
export async function seedTravellerSample(user: PublicUser, now = new Date()): Promise<void> {
  if (!demoSupportEnabled()) return;
  const ar = user.preferredLocale === "ar";
  const lang: Lang = ar ? "ar" : "en";
  const t = ticket(`demo-${user.id}`, "SUP-0900", {
    userId: user.id, userName: user.individual?.fullName ?? user.company?.companyName ?? user.email, userEmail: user.email, nationality: user.individual?.nationality ?? "",
    lang, subject: ar ? "استفسار عن مواعيد التذكرة (مثال تجريبي)" : "Question about my ticket times (sample)", category: "events", status: "waiting", priority: "normal",
    msgs: ar
      ? [
          { from: "traveller", lang: "ar", minutes: 120, text: "مرحبًا، هل يمكنني الدخول إلى الفعالية قبل موعدها بساعة؟", tr: null },
          { from: "staff", lang: "ar", minutes: 100, text: "أهلًا بك! تفتح البوابات عادة قبل الموعد بـ 45 دقيقة. اعرض رمز الدخول من «حجوزاتي» عند البوابة. هل تحتاج مساعدة أخرى؟", tr: null },
        ]
      : [
          { from: "traveller", lang: "en", minutes: 120, text: "Hi, can I enter the event an hour before it starts?", tr: "مرحبًا، هل يمكنني الدخول إلى الفعالية قبل موعدها بساعة؟" },
          { from: "staff", lang: "ar", minutes: 100, text: "أهلًا بك! تفتح البوابات عادة قبل الموعد بـ 45 دقيقة. اعرض رمز الدخول من «حجوزاتي» عند البوابة. هل تحتاج مساعدة أخرى؟", tr: "Welcome! Gates usually open 45 minutes before the start. Show the entry code from My bookings at the gate. Do you need anything else?" },
        ],
  }, now);
  await store().insert(COL, t.id, t);
}
