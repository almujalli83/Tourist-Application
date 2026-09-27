/**
 * Service 13 — multilingual support. Travellers open numbered tickets (SUP-1001…) in their
 * language, optionally linked to a booking, with attachments. Messages are translated for the
 * other side (the team works in Arabic) — the original is always kept. Tickets about a trip that is
 * under way or starts within 48 hours are high priority. The team answers from the back office
 * (assign, canned replies, status); travellers are notified in the app and by email.
 */
import { randomUUID } from "node:crypto";
import { aiConfigured, askClaude } from "../assistant/claude";
import { LANGUAGES, type Lang } from "../assistant/translate";
import type { PublicUser } from "../auth/types";
import { displayName } from "../auth/types";
import { isAdminEmail } from "../config";
import { readFile, saveFile, type StoredFileRef } from "../files";
import { notifyTravellers } from "../notify";
import type { AppNotification } from "../reminders/reminders";
import { getBookingForUser, getUserById, listBookingsByUser } from "../repo";
import { store } from "../store";
import { FAQS } from "./faq";
import { translateSupport } from "./translate";
import {
  MAX_ATTACHMENT_BYTES, MAX_ATTACHMENTS, MAX_MESSAGE, MAX_SUBJECT, SUPPORT_CATEGORIES,
  type PublicTicket, type SupportAttachment, type SupportCategory, type SupportMessage, type TicketPriority, type TicketStatus,
} from "./types";

const COL = "supportTickets" as const;
const HIGH_PRIORITY_HOURS = 48;

type StoredAttachment = SupportAttachment & { ref: StoredFileRef };
type StoredMessage = Omit<SupportMessage, "attachments"> & { attachments: StoredAttachment[] };
export interface StoredTicket extends Omit<PublicTicket, "messages"> {
  userId: string;
  userName: string;
  userEmail: string;
  nationality: string | null;
  messages: StoredMessage[];
  closedAt: string | null;
}

export class SupportError extends Error {
  constructor(public code: string, public status = 422) {
    super(code);
  }
}

const isLang = (v: unknown): v is Lang => typeof v === "string" && (LANGUAGES as readonly string[]).includes(v);

/* ------------------------------------------------------------ helpers */

async function nextNumber(): Promise<string> {
  await store().insert("config", "supportSeq", { id: "supportSeq", n: 1000 });
  const doc = await store().update<{ id: string; n: number }>("config", "supportSeq", (d) => ({ ...d, n: d.n + 1 }));
  return `SUP-${doc!.n}`;
}

function parseAttachments(input: unknown, folder: string): Promise<StoredAttachment[]> {
  if (input === undefined || input === null) return Promise.resolve([]);
  if (!Array.isArray(input) || input.length > MAX_ATTACHMENTS) throw new SupportError("attachments", 400);
  const files = input.map((f) => {
    const x = (f && typeof f === "object" ? f : {}) as { name?: unknown; data?: unknown };
    const m = typeof x.data === "string" ? /^data:(image\/(?:jpeg|png|webp)|application\/pdf);base64,([A-Za-z0-9+/=]+)$/.exec(x.data) : null;
    if (!m) throw new SupportError("attachments", 400);
    const data = Buffer.from(m[2], "base64");
    if (data.length > MAX_ATTACHMENT_BYTES) throw new SupportError("attachmentTooLarge", 400);
    const name = (typeof x.name === "string" ? x.name : "file").replace(/[^\w.\- ]/g, "_").slice(0, 80) || "file";
    return { name, contentType: m[1], data };
  });
  return Promise.all(files.map(async (f) => ({ id: randomUUID(), name: f.name, contentType: f.contentType, size: f.data.length, ref: await saveFile(folder, f.data, f.contentType) })));
}

const publicMessage = (m: StoredMessage): SupportMessage => ({ ...m, attachments: m.attachments.map(({ id, name, contentType, size }) => ({ id, name, contentType, size })) });

export function toPublicTicket(t: StoredTicket): PublicTicket {
  const { id, number, subject, category, status, priority, lang, booking, createdAt, updatedAt, assignedTo, demo } = t;
  return { id, number, subject, category, status, priority, lang, booking, createdAt, updatedAt, assignedTo, messages: t.messages.map(publicMessage), ...(demo ? { demo } : {}) };
}

/** High priority when the traveller's trip is under way or starts within 48 hours. */
async function priorityFor(userId: string, now: Date): Promise<TicketPriority> {
  const soon = new Date(now.getTime() + HIGH_PRIORITY_HOURS * 3600_000 + 3 * 3600_000).toISOString().slice(0, 10);
  const today = new Date(now.getTime() + 3 * 3600_000).toISOString().slice(0, 10);
  const trips = await listBookingsByUser(userId);
  return trips.some((b) => b.status !== "CANCELLED" && b.criteria.departureDate <= soon && b.criteria.returnDate >= today) ? "high" : "normal";
}

async function message(from: StoredMessage["from"], author: string | null, text: string, lang: Lang, translateTo: Lang, attachments: StoredAttachment[], now: Date): Promise<StoredMessage> {
  const translated = lang !== translateTo ? await translateSupport(text, lang, translateTo) : null;
  return { id: randomUUID(), from, author, at: now.toISOString(), text, lang, translation: translated ? { lang: translateTo, text: translated } : null, attachments };
}

function cleanText(v: unknown, max: number, code: string): string {
  const s = typeof v === "string" ? v.trim() : "";
  if (!s) throw new SupportError(code, 400);
  if (s.length > max) throw new SupportError(`${code}TooLong`, 400);
  return s;
}

/* --------------------------------------------------------- automatic answer */

const ASSISTANT_SYSTEM = `You are the first-line support assistant of Saudi Trip, a tourism package and visa app for Saudi Arabia. Answer the traveller's support request briefly and politely in their language, using only the FAQ below and general, safe travel guidance. Never invent booking details, prices, refund decisions or policies. End by saying a member of the support team will follow up. If it is an emergency, tell them to call 911.

FAQ:
${FAQS.map((f) => `- ${f.qEn} ${f.aEn}`).join("\n")}`;

async function assistantAnswer(subject: string, text: string, lang: Lang): Promise<string | null> {
  if (!aiConfigured()) return null;
  try {
    return await askClaude({
      system: [{ type: "text", text: ASSISTANT_SYSTEM }],
      messages: [{ role: "user", content: `Reply in language code "${lang}".\n\nSubject: ${subject}\n\n${text}` }],
      maxTokens: 800,
    });
  } catch {
    return null;
  }
}

/* ------------------------------------------------------------- traveller */

export interface NewTicketInput {
  subject?: unknown;
  category?: unknown;
  message?: unknown;
  lang?: unknown;
  bookingId?: unknown;
  attachments?: unknown;
}

export async function createTicket(user: PublicUser, input: NewTicketInput, now = new Date()): Promise<PublicTicket> {
  const subject = cleanText(input.subject, MAX_SUBJECT, "subject");
  const text = cleanText(input.message, MAX_MESSAGE, "message");
  const category = (SUPPORT_CATEGORIES as readonly string[]).includes(input.category as string) ? (input.category as SupportCategory) : "other";
  const lang: Lang = isLang(input.lang) ? input.lang : user.preferredLocale;
  let booking: PublicTicket["booking"] = null;
  if (typeof input.bookingId === "string" && input.bookingId) {
    const b = await getBookingForUser(user.id, input.bookingId);
    if (!b) throw new SupportError("booking", 400);
    booking = { id: b.id, reference: b.reference };
  }
  const id = randomUUID();
  const attachments = await parseAttachments(input.attachments, `support/${id}`);
  const first = await message("traveller", null, text, lang, "ar", attachments, now);
  const messages: StoredMessage[] = [first];
  const auto = await assistantAnswer(subject, text, lang);
  if (auto) messages.push(await message("assistant", null, auto, lang, "ar", [], new Date(now.getTime() + 1000)));
  const ticket: StoredTicket = {
    id, number: await nextNumber(), subject, category, status: "open", priority: category === "complaint" ? "high" : await priorityFor(user.id, now), lang, booking,
    createdAt: now.toISOString(), updatedAt: now.toISOString(), assignedTo: null, messages,
    userId: user.id, userName: displayName(user), userEmail: user.email, nationality: user.individual?.nationality ?? null, closedAt: null,
  };
  await store().insert(COL, id, ticket);
  if (ticket.priority === "high") await alertTeam(ticket);
  return toPublicTicket(ticket);
}

export async function listMyTickets(userId: string): Promise<PublicTicket[]> {
  const rows = await store().findBy<StoredTicket>(COL, "userId", userId);
  return rows.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt)).map(toPublicTicket);
}

async function ownTicket(userId: string, id: string): Promise<StoredTicket> {
  const t = await store().get<StoredTicket>(COL, id);
  if (!t || t.userId !== userId) throw new SupportError("notFound", 404);
  return t;
}

export async function getMyTicket(userId: string, id: string): Promise<PublicTicket> {
  return toPublicTicket(await ownTicket(userId, id));
}

/** A traveller's reply (re-opens a closed ticket). */
export async function travellerReply(user: PublicUser, id: string, input: { message?: unknown; attachments?: unknown }, now = new Date()): Promise<PublicTicket> {
  const t = await ownTicket(user.id, id);
  const text = cleanText(input.message, MAX_MESSAGE, "message");
  const m = await message("traveller", null, text, t.lang, "ar", await parseAttachments(input.attachments, `support/${id}`), now);
  const saved = await store().update<StoredTicket>(COL, id, (x) => ({ ...x, messages: [...x.messages, m], status: "open", closedAt: null, updatedAt: now.toISOString() }));
  return toPublicTicket(saved!);
}

export async function travellerClose(userId: string, id: string, now = new Date()): Promise<PublicTicket> {
  await ownTicket(userId, id);
  const saved = await store().update<StoredTicket>(COL, id, (x) => ({ ...x, status: "closed", closedAt: now.toISOString(), updatedAt: now.toISOString() }));
  return toPublicTicket(saved!);
}

/** An attachment: for the ticket's traveller and the back office. */
export async function ticketAttachment(ticketId: string, fileId: string, viewer: PublicUser | null): Promise<{ data: Buffer; contentType: string; name: string } | null> {
  const t = await store().get<StoredTicket>(COL, ticketId);
  if (!t || !viewer || (viewer.id !== t.userId && !viewer.isAdmin)) return null;
  const f = t.messages.flatMap((m) => m.attachments).find((a) => a.id === fileId);
  if (!f) return null;
  const data = await readFile(f.ref);
  return data ? { data, contentType: f.contentType, name: f.name } : null;
}

/* ------------------------------------------------------------ back office */

export interface AdminTicketRow extends Omit<PublicTicket, "messages"> {
  userName: string;
  lastMessage: { from: SupportMessage["from"]; at: string; text: string };
  count: number;
}

export async function adminListTickets(filter: { status?: TicketStatus | "all"; priority?: TicketPriority | "all"; mine?: string } = {}): Promise<AdminTicketRow[]> {
  const rows = await store().list<StoredTicket>(COL, 5000);
  const order = { open: 0, waiting: 1, closed: 2 };
  return rows
    .filter((t) => (!filter.status || filter.status === "all" || t.status === filter.status) && (!filter.priority || filter.priority === "all" || t.priority === filter.priority) && (!filter.mine || t.assignedTo === filter.mine))
    // Open first, high priority first, then the longest waiting.
    .sort((a, b) => order[a.status] - order[b.status] || Number(b.priority === "high") - Number(a.priority === "high") || (a.status === "closed" ? b.updatedAt.localeCompare(a.updatedAt) : a.updatedAt.localeCompare(b.updatedAt)))
    .map((t) => {
      const last = t.messages[t.messages.length - 1];
      const { messages, ...rest } = toPublicTicket(t);
      void messages;
      return { ...rest, userName: t.userName, count: t.messages.length, lastMessage: { from: last.from, at: last.at, text: (last.translation?.lang === "ar" ? last.translation.text : last.text).slice(0, 140) } };
    });
}

export async function adminGetTicket(id: string) {
  const t = await store().get<StoredTicket>(COL, id);
  if (!t) throw new SupportError("notFound", 404);
  const b = t.booking && !t.demo ? await store().get<import("../bookings/types").StoredBooking>("bookings", t.booking.id) : null;
  return {
    ticket: toPublicTicket(t),
    traveller: { name: t.userName, email: t.userEmail, nationality: t.nationality },
    booking: b
      ? { id: b.id, reference: b.reference, status: b.status, departureDate: b.criteria.departureDate, returnDate: b.criteria.returnDate, cities: b.criteria.stays.map((s) => s.city), travellers: b.applicants.length, totalSAR: b.price.totalSAR }
      : null,
  };
}

/** A reply from the team (in Arabic, translated for the traveller); optionally closes the ticket. */
export async function staffReply(admin: PublicUser, id: string, input: { message?: unknown; attachments?: unknown; close?: unknown }, now = new Date()): Promise<PublicTicket> {
  const t = await store().get<StoredTicket>(COL, id);
  if (!t) throw new SupportError("notFound", 404);
  const text = cleanText(input.message, MAX_MESSAGE, "message");
  const writtenIn: Lang = /[؀-ۿ]/.test(text) ? "ar" : "en";
  const m = await message("staff", displayName(admin), text, writtenIn, t.lang, await parseAttachments(input.attachments, `support/${id}`), now);
  const close = input.close === true;
  const saved = await store().update<StoredTicket>(COL, id, (x) => ({
    ...x, messages: [...x.messages, m], status: close ? "closed" : "waiting", closedAt: close ? now.toISOString() : null,
    assignedTo: x.assignedTo ?? admin.email, updatedAt: now.toISOString(),
  }));
  await notifyTraveller(saved!, m, now);
  return toPublicTicket(saved!);
}

export async function adminUpdateTicket(id: string, patch: { status?: unknown; assignedTo?: unknown; priority?: unknown }, now = new Date()): Promise<PublicTicket> {
  const saved = await store().update<StoredTicket>(COL, id, (x) => {
    const status = patch.status === "open" || patch.status === "waiting" || patch.status === "closed" ? patch.status : x.status;
    return {
      ...x, status,
      closedAt: status === "closed" ? x.closedAt ?? now.toISOString() : null,
      priority: patch.priority === "high" || patch.priority === "normal" ? patch.priority : x.priority,
      assignedTo: patch.assignedTo === null ? null : typeof patch.assignedTo === "string" && isAdminEmail(patch.assignedTo) ? patch.assignedTo.toLowerCase() : x.assignedTo,
      updatedAt: now.toISOString(),
    };
  });
  if (!saved) throw new SupportError("notFound", 404);
  return toPublicTicket(saved);
}

/* ---------------------------------------------------------- notifications */

async function alertTeam(t: StoredTicket) {
  const to = (process.env.SUPPORT_EMAIL ?? process.env.ADMIN_EMAILS ?? "").split(",").map((e) => e.trim()).filter(Boolean);
  if (!to.length) return;
  const first = t.messages[0];
  await notifyTravellers(to, {
    subject: `[${t.number}] أولوية عالية — ${t.subject}`,
    text: [`تذكرة دعم جديدة ذات أولوية عالية (رحلة جارية أو خلال 48 ساعة).`, `المسافر: ${t.userName} (${t.userEmail})`, `اللغة: ${t.lang}`, "", first.translation?.text ?? first.text].join("\n"),
  });
}

async function notifyTraveller(t: StoredTicket, m: StoredMessage, now: Date) {
  const forTraveller = m.translation?.text ?? m.text;
  const excerpt = forTraveller.length > 220 ? `${forTraveller.slice(0, 220)}…` : forTraveller;
  const closed = t.status === "closed";
  const n: AppNotification = {
    id: `support:${t.id}:${m.id}`, userId: t.userId, kind: "support", bookingId: t.booking?.id ?? "", reference: t.number, createdAt: now.toISOString(),
    titleAr: closed ? `أُغلقت تذكرة الدعم ${t.number}` : `رد جديد على تذكرة الدعم ${t.number}`,
    titleEn: closed ? `Support ticket ${t.number} closed` : `New reply on support ticket ${t.number}`,
    linesAr: [t.subject, t.lang === "ar" ? excerpt : m.text.slice(0, 220)],
    linesEn: [t.subject, excerpt],
    href: `/support/${t.id}`, readAt: null, deletedAt: null, email: null,
  };
  await store().insert("notifications", n.id, n);
  const user = await getUserById(t.userId);
  if (!user) return;
  const sent = await notifyTravellers([user.email], {
    subject: `Saudi Trip — ${n.titleEn} / ${n.titleAr}`,
    text: [n.titleEn, t.subject, "", excerpt, ...(m.translation ? ["", "—", m.text] : [])].join("\n"),
  });
  if (sent) await store().update<AppNotification>("notifications", n.id, (x) => ({ ...x, email: { to: sent.to, status: sent.status } }));
}
