/**
 * Family and group accounts. The head invites members by email; each member chooses what to share
 * with the family: their trips (shown together to every member) and their saved travellers (so
 * the family can book for them). Children without accounts stay saved travellers of the head.
 */
import { randomUUID } from "node:crypto";
import { AccountError } from "../auth/account";
import { consumeToken, issueToken, peekToken } from "../auth/tokens";
import { EMAIL_RE } from "../auth/validation";
import type { StoredBooking } from "../bookings/types";
import { notifyTravellers } from "../notify";
import { getUserById } from "../repo";
import { getSavedTraveller, listSavedTravellers } from "../saved-travellers-repo";
import type { SavedTraveller, SavedTravellerSummary } from "../saved-travellers";
import { siteUrl } from "../site";
import { store } from "../store";

export const RELATIONS = ["spouse", "son", "daughter", "father", "mother", "brother", "sister", "relative", "friend", "colleague"] as const;
export type Relation = (typeof RELATIONS)[number];
export const MAX_MEMBERS = 12;
const INVITE_TTL = 7 * 86_400_000;

export interface FamilyMember {
  key: string;
  userId: string | null;
  email: string;
  name: string;
  relation: Relation | "head";
  status: "invited" | "active";
  shareTrips: boolean;
  shareTravellers: boolean;
  invitedAt: string;
  joinedAt?: string;
}

export interface Family {
  id: string;
  name: string;
  ownerId: string;
  members: FamilyMember[];
  createdAt: string;
  updatedAt: string;
}

interface FamilyLink {
  id: string;
  userId: string;
  familyId: string;
}

type Locale = "ar" | "en";

const nameOf = (u: { individual?: { fullName: string }; company?: { contactPerson: string }; email: string }) => u.individual?.fullName || u.company?.contactPerson || u.email;

export async function familyOf(userId: string): Promise<Family | null> {
  const link = await store().get<FamilyLink>("familyLinks", userId);
  if (!link) return null;
  const f = await store().get<Family>("families", link.familyId);
  return f && f.members.some((m) => m.userId === userId && m.status === "active") ? f : null;
}

async function save(f: Family): Promise<Family> {
  const next = { ...f, updatedAt: new Date().toISOString() };
  await store().put("families", f.id, next);
  return next;
}

async function mustOwn(userId: string): Promise<Family> {
  const f = await familyOf(userId);
  if (!f) throw new AccountError("noFamily");
  if (f.ownerId !== userId) throw new AccountError("notHead");
  return f;
}

export async function createFamily(userId: string, nameIn: unknown): Promise<Family> {
  const u = await getUserById(userId);
  if (!u) throw new AccountError("unauthorized");
  if (await familyOf(userId)) throw new AccountError("alreadyInFamily");
  const name = typeof nameIn === "string" ? nameIn.trim().slice(0, 60) : "";
  if (!name) throw new AccountError("required");
  const now = new Date().toISOString();
  const f: Family = {
    id: randomUUID(), name, ownerId: userId, createdAt: now, updatedAt: now,
    members: [{ key: randomUUID().slice(0, 8), userId, email: u.email, name: nameOf(u), relation: "head", status: "active", shareTrips: true, shareTravellers: true, invitedAt: now, joinedAt: now }],
  };
  await store().put("families", f.id, f);
  await store().put<FamilyLink>("familyLinks", userId, { id: userId, userId, familyId: f.id });
  return f;
}

export async function renameFamily(userId: string, nameIn: unknown): Promise<Family> {
  const f = await mustOwn(userId);
  const name = typeof nameIn === "string" ? nameIn.trim().slice(0, 60) : "";
  if (!name) throw new AccountError("required");
  return save({ ...f, name });
}

/** Invites a member by email (a link valid 7 days). */
export async function inviteMember(userId: string, input: { email?: unknown; name?: unknown; relation?: unknown }, locale: Locale, req: Request): Promise<Family> {
  const f = await mustOwn(userId);
  const email = typeof input.email === "string" ? input.email.trim().toLowerCase() : "";
  const name = typeof input.name === "string" ? input.name.trim().slice(0, 80) : "";
  const relation = RELATIONS.includes(input.relation as Relation) ? (input.relation as Relation) : null;
  if (!EMAIL_RE.test(email)) throw new AccountError("email");
  if (!name || !relation) throw new AccountError("required");
  const existing = f.members.find((m) => m.email === email);
  if (existing?.status === "active") throw new AccountError("alreadyMember");
  if (!existing && f.members.length >= MAX_MEMBERS) throw new AccountError("familyFull");
  const now = new Date().toISOString();
  const member: FamilyMember = existing
    ? { ...existing, name, relation, invitedAt: now }
    : { key: randomUUID().slice(0, 8), userId: null, email, name, relation, status: "invited", shareTrips: true, shareTravellers: false, invitedAt: now };
  const next = await save({ ...f, members: existing ? f.members.map((m) => (m.key === member.key ? member : m)) : [...f.members, member] });
  const token = await issueToken("familyInvite", userId, INVITE_TTL, { familyId: f.id, email, key: member.key });
  const head = await getUserById(userId);
  const url = `${siteUrl(req)}/${locale}/family/join?token=${token}`;
  await notifyTravellers([email], {
    subject: `Saudi Trip — ${head ? nameOf(head) : ""} invited you to "${f.name}" / دعوة للانضمام إلى «${f.name}»`,
    text: [
      `${head ? nameOf(head) : "A family member"} invited you to join "${f.name}" on Saudi Trip to share trips and plan together. The link is valid for 7 days:`, url, "",
      `دعاك ${head ? nameOf(head) : "أحد أفراد العائلة"} للانضمام إلى «${f.name}» في سعودي تريب لمشاركة الرحلات والتخطيط معًا. الرابط صالح 7 أيام:`, url.replace(`/${locale}/`, "/ar/"),
    ].join("\n"),
  }, { redact: [token] });
  return next;
}

export async function invitePreview(token: unknown): Promise<{ familyName: string; headName: string; email: string; members: number } | null> {
  const t = await peekToken("familyInvite", String(token ?? ""));
  if (!t) return null;
  const f = await store().get<Family>("families", String(t.data?.familyId));
  const head = f ? await getUserById(f.ownerId) : null;
  if (!f || !head || !f.members.some((m) => m.key === t.data?.key && m.status === "invited")) return null;
  return { familyName: f.name, headName: nameOf(head), email: String(t.data?.email), members: f.members.filter((m) => m.status === "active").length };
}

/** Joins with the invitation (signed in with the invited email), with the member's sharing choices. */
export async function acceptInvite(userId: string, token: unknown, sharing: { shareTrips?: unknown; shareTravellers?: unknown }): Promise<Family> {
  const t = await peekToken("familyInvite", String(token ?? ""));
  if (!t) throw new AccountError("expired");
  const u = await getUserById(userId);
  if (!u) throw new AccountError("unauthorized");
  if (u.email !== t.data?.email) throw new AccountError("wrongAccount");
  if (await familyOf(userId)) throw new AccountError("alreadyInFamily");
  const f = await store().get<Family>("families", String(t.data?.familyId));
  const m = f?.members.find((x) => x.key === t.data?.key && x.status === "invited");
  if (!f || !m) throw new AccountError("expired");
  if (!(await consumeToken("familyInvite", String(token)))) throw new AccountError("expired");
  const now = new Date().toISOString();
  const next = await save({
    ...f,
    members: f.members.map((x) => (x.key === m.key ? { ...x, userId, name: nameOf(u) || x.name, status: "active", joinedAt: now, shareTrips: sharing.shareTrips !== false, shareTravellers: sharing.shareTravellers === true } : x)),
  });
  await store().put<FamilyLink>("familyLinks", userId, { id: userId, userId, familyId: f.id });
  const head = await getUserById(f.ownerId);
  if (head) {
    await notifyTravellers([head.email], {
      subject: `Saudi Trip — ${nameOf(u)} joined "${f.name}" / انضم ${nameOf(u)} إلى «${f.name}»`,
      text: `${nameOf(u)} accepted your invitation and joined "${f.name}".\n\nقبل ${nameOf(u)} دعوتك وانضم إلى «${f.name}».`,
    });
  }
  return next;
}

export async function updateSharing(userId: string, sharing: { shareTrips?: unknown; shareTravellers?: unknown }): Promise<Family> {
  const f = await familyOf(userId);
  if (!f) throw new AccountError("noFamily");
  return save({
    ...f,
    members: f.members.map((m) => (m.userId === userId ? {
      ...m,
      ...(typeof sharing.shareTrips === "boolean" ? { shareTrips: sharing.shareTrips } : {}),
      ...(typeof sharing.shareTravellers === "boolean" ? { shareTravellers: sharing.shareTravellers } : {}),
    } : m)),
  });
}

/** Removes a member or cancels an invitation (the head). */
export async function removeMember(userId: string, key: string): Promise<Family> {
  const f = await mustOwn(userId);
  const m = f.members.find((x) => x.key === key);
  if (!m) throw new AccountError("notFound");
  if (m.userId === userId) throw new AccountError("headCannotLeave");
  if (m.userId) await store().delete("familyLinks", m.userId);
  return save({ ...f, members: f.members.filter((x) => x.key !== key) });
}

export async function leaveFamily(userId: string): Promise<void> {
  const f = await familyOf(userId);
  if (!f) throw new AccountError("noFamily");
  if (f.ownerId === userId) throw new AccountError("headCannotLeave");
  await store().delete("familyLinks", userId);
  await save({ ...f, members: f.members.filter((x) => x.userId !== userId) });
}

/** Hands the family over to another active member. */
export async function transferHead(userId: string, key: string): Promise<Family> {
  const f = await mustOwn(userId);
  const m = f.members.find((x) => x.key === key && x.status === "active" && x.userId);
  if (!m || m.userId === userId) throw new AccountError("notFound");
  return save({
    ...f, ownerId: m.userId!,
    members: f.members.map((x) => (x.key === key ? { ...x, relation: "head" as const } : x.userId === userId ? { ...x, relation: "relative" as const } : x)),
  });
}

export async function deleteFamily(userId: string): Promise<void> {
  const f = await mustOwn(userId);
  for (const m of f.members) if (m.userId) await store().delete("familyLinks", m.userId);
  await store().delete("families", f.id);
}

/** Leaves the family when an account is deleted (a head's family goes to the next member, or ends). */
export async function onAccountDeleted(userId: string): Promise<void> {
  const f = await familyOf(userId);
  if (!f) return;
  if (f.ownerId !== userId) return leaveFamily(userId);
  const heir = f.members.find((m) => m.userId && m.userId !== userId && m.status === "active");
  if (!heir) return deleteFamily(userId);
  await transferHead(userId, heir.key);
  await leaveFamily(userId);
}

/* ---------------------------------------------------------------- shared data */

export interface FamilyTrip {
  memberName: string;
  mine: boolean;
  bookingId: string;
  reference: string;
  cities: string[];
  departureDate: string;
  returnDate: string;
  travellers: number;
  status: string;
  flights: { kind: string; flightNo: string; from: string; to: string; departAt: string; arriveAt: string }[];
  hotels: { city: string; nameAr: string; nameEn: string; checkIn: string; checkOut: string }[];
}

/** Trips of the members who share them (current and upcoming first, then the last past ones). */
export async function familyTrips(userId: string, today = new Date().toISOString().slice(0, 10)): Promise<FamilyTrip[]> {
  const f = await familyOf(userId);
  if (!f) return [];
  const out: FamilyTrip[] = [];
  for (const m of f.members) {
    if (m.status !== "active" || !m.userId || (!m.shareTrips && m.userId !== userId)) continue;
    const bookings = await store().findBy<StoredBooking>("bookings", "userId", m.userId);
    for (const b of bookings) {
      if (b.status === "CANCELLED" || b.mt?.packageStatus === "CANCELLED") continue;
      out.push({
        memberName: m.name, mine: m.userId === userId, bookingId: b.id, reference: b.reference,
        cities: b.criteria.stays.map((s) => s.city), departureDate: b.criteria.departureDate, returnDate: b.criteria.returnDate,
        travellers: b.applicants.length, status: b.mt?.packageStatus ?? b.status,
        flights: b.flights.map((x) => ({ kind: x.kind, flightNo: x.flightNo, from: x.from, to: x.to, departAt: x.departAt, arriveAt: x.arriveAt })),
        hotels: b.hotels.map((h) => ({ city: h.city, nameAr: h.nameAr, nameEn: h.nameEn, checkIn: h.checkIn, checkOut: h.checkOut })),
      });
    }
  }
  const upcoming = out.filter((t) => t.returnDate >= today).sort((a, b) => a.departureDate.localeCompare(b.departureDate));
  const past = out.filter((t) => t.returnDate < today).sort((a, b) => b.departureDate.localeCompare(a.departureDate)).slice(0, 10);
  return [...upcoming, ...past];
}

export type FamilyTravellerSummary = SavedTravellerSummary & { sharedBy: string };
const FAM = /^fam:([\w-]+):([\w-]+)$/;

/** Saved travellers other members share with the family (ids "fam:{memberId}:{travellerId}"). */
export async function familyTravellers(userId: string): Promise<FamilyTravellerSummary[]> {
  const f = await familyOf(userId);
  if (!f) return [];
  const out: FamilyTravellerSummary[] = [];
  for (const m of f.members) {
    if (m.status !== "active" || !m.userId || m.userId === userId || !m.shareTravellers) continue;
    for (const s of await listSavedTravellers(m.userId)) out.push({ ...s, id: `fam:${m.userId}:${s.id}`, sharedBy: m.name });
  }
  return out;
}

export async function familyTraveller(userId: string, id: string): Promise<SavedTraveller | null> {
  const match = FAM.exec(id);
  if (!match) return null;
  const [, memberId, travellerId] = match;
  const f = await familyOf(userId);
  const m = f?.members.find((x) => x.userId === memberId && x.status === "active" && x.shareTravellers);
  if (!f || !m || memberId === userId) return null;
  const t = await getSavedTraveller(memberId, travellerId);
  return t ? { ...t, id } : null;
}

/** The family as the member sees it (emails of others masked). */
export function familyView(f: Family, userId: string) {
  const head = f.ownerId === userId;
  return {
    id: f.id, name: f.name, isHead: head,
    members: f.members.map((m) => ({
      key: m.key, name: m.name, relation: m.relation, status: m.status, me: m.userId === userId, head: m.userId === f.ownerId,
      shareTrips: m.shareTrips, shareTravellers: m.shareTravellers,
      email: head || m.userId === userId ? m.email : m.email.replace(/^(.).*(@.*)$/, "$1•••$2"),
      invitedAt: m.invitedAt,
    })),
  };
}


