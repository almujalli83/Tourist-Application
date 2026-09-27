/**
 * Nusuk permits issued from Saudi Trip: the traveller picks a day of the trip (Umrah: the nights in
 * Makkah; Rawdah: the days in Madinah) and a time from Nusuk's availability; the permit is issued at
 * once in the chosen travellers' names, saved in their wallet (PDF) and shown on their digital card.
 * Permits that no longer fit the trip (cancelled, or dates changed) are cancelled in Nusuk.
 */
import { randomBytes } from "node:crypto";
import QRCode from "qrcode";
import { cityName } from "../data/cities";
import { simplePdf } from "../simple-pdf";
import { store } from "../store";
import { addIssuedDocument, retireIssuedDocument } from "../wallet";
import { NusukError, nusukProvider, type NusukSlot, type PermitType, type RawdahGroup } from "./nusuk";
import { notifyUmrah, tripContexts, type TripContext } from "./trips";

const COL = "umrahPermits" as const;

export interface StoredPermit {
  id: string;
  userId: string;
  /** The booking id, or "demo" (sandbox sample trip). */
  tripKey: string;
  reference: string | null;
  type: PermitType;
  group: RawdahGroup | null;
  permitNo: string;
  qr: string;
  date: string;
  start: string;
  end: string;
  travellers: { applicationNo: string; nameEn: string; passportNo: string; nationality: string }[];
  status: "issued" | "cancelled";
  cancelReason: "traveller" | "tripChanged" | null;
  source: "nusuk" | "sandbox";
  createdAt: string;
  cancelledAt: string | null;
}

export type PublicPermit = Omit<StoredPermit, "travellers" | "userId"> & { travellers: { applicationNo: string; nameEn: string }[] };

export const toPublicPermit = (p: StoredPermit): PublicPermit => {
  const { userId: _u, travellers, ...rest } = p; // eslint-disable-line @typescript-eslint/no-unused-vars
  return { ...rest, travellers: travellers.map((t) => ({ applicationNo: t.applicationNo, nameEn: t.nameEn })) };
};

export class PermitError extends Error {
  constructor(public code: string, public status = 400) {
    super(code);
  }
}

const TYPE_AR: Record<PermitType, string> = { umrah: "العمرة", rawdah: "الروضة الشريفة" };
const TYPE_EN: Record<PermitType, string> = { umrah: "Umrah", rawdah: "Rawdah" };

async function context(userId: string, tripKey: string, now: Date): Promise<TripContext & { cancelled?: boolean }> {
  const t = (await tripContexts(userId, now)).find((x) => x.key === tripKey);
  if (!t || t.cancelled) throw new PermitError("tripNotFound", 404);
  return t;
}

function checkDay(t: TripContext, type: PermitType, date: string) {
  if (!t.windows[type].includes(date)) throw new PermitError(type === "umrah" && t.pause && date >= t.pause.from && date <= t.pause.to ? "hajjPause" : "invalidDate");
}

/** Times Nusuk offers on a day of the trip for the given number of people. */
export async function availableSlots(userId: string, q: { tripKey: string; type: PermitType; date: string; people: number; group?: RawdahGroup }, now = new Date()): Promise<NusukSlot[]> {
  const nusuk = nusukProvider();
  if (!nusuk) throw new PermitError("notLinked", 409);
  if (q.type === "rawdah" && q.group !== "men" && q.group !== "women") throw new PermitError("invalidGroup");
  const t = await context(userId, q.tripKey, now);
  checkDay(t, q.type, q.date);
  try {
    return (await nusuk.slots({ type: q.type, date: q.date, people: q.people, group: q.group })).sort((a, b) => a.start.localeCompare(b.start));
  } catch (e) {
    if (e instanceof NusukError) throw new PermitError(`nusuk_${e.code}`, 502);
    throw e;
  }
}

export interface IssueInput { tripKey: string; type: PermitType; date: string; slotId: string; applicationNos: string[]; group?: RawdahGroup }

/** Issues the permit in Nusuk for the chosen travellers (one permit for the group). */
export async function issuePermit(userId: string, input: IssueInput, now = new Date()): Promise<PublicPermit> {
  const nusuk = nusukProvider();
  if (!nusuk) throw new PermitError("notLinked", 409);
  if (input.type !== "umrah" && input.type !== "rawdah") throw new PermitError("invalidType");
  if (input.type === "rawdah" && input.group !== "men" && input.group !== "women") throw new PermitError("invalidGroup");
  const t = await context(userId, input.tripKey, now);
  checkDay(t, input.type, input.date);
  const ids = [...new Set(Array.isArray(input.applicationNos) ? input.applicationNos : [])];
  const people = t.people.filter((p) => ids.includes(p.applicationNo));
  if (!people.length || people.length !== ids.length) throw new PermitError("invalidTravellers");
  if (people.some((p) => !p.visaNumber)) throw new PermitError("visaNotIssued");
  // One permit of each kind per traveller and trip.
  const active = (await store().findBy<StoredPermit>(COL, "userId", userId)).filter((p) => p.status === "issued" && p.tripKey === t.key && p.type === input.type);
  if (people.some((p) => active.some((a) => a.travellers.some((x) => x.applicationNo === p.applicationNo)))) throw new PermitError("alreadyHasPermit", 409);

  let slot: NusukSlot | undefined;
  let issued: { permitNo: string; qr: string };
  try {
    slot = (await nusuk.slots({ type: input.type, date: input.date, people: people.length, group: input.group })).find((s) => s.id === input.slotId);
    if (!slot) throw new PermitError("slotNotFound", 404);
    if (slot.remaining < people.length) throw new PermitError("slotFull", 409);
    issued = await nusuk.issue({ type: input.type, slot, group: input.group, travellers: people.map((p) => ({ passportNo: p.passportNo, nationality: p.nationality, nameEn: p.nameEn, visaNumber: p.visaNumber! })) });
  } catch (e) {
    if (e instanceof NusukError) throw new PermitError(e.code === "slotFull" ? "slotFull" : `nusuk_${e.code}`, e.code === "slotFull" ? 409 : 502);
    throw e;
  }
  const permit: StoredPermit = {
    id: randomBytes(10).toString("hex"), userId, tripKey: t.key!, reference: t.reference, type: input.type, group: input.type === "rawdah" ? input.group! : null,
    permitNo: issued.permitNo, qr: issued.qr, date: input.date, start: slot.start, end: slot.end,
    travellers: people.map((p) => ({ applicationNo: p.applicationNo, nameEn: p.nameEn, passportNo: p.passportNo, nationality: p.nationality })),
    status: "issued", cancelReason: null, source: nusuk.mode === "api" ? "nusuk" : "sandbox", createdAt: now.toISOString(), cancelledAt: null,
  };
  await store().put(COL, permit.id, permit);

  // Wallet: the permit for each traveller (not for the sandbox sample trip).
  if (!t.demo) {
    for (const p of permit.travellers) {
      const pdf = simplePdf([
        { text: "Nusuk - Ministry of Hajj and Umrah", size: 16, bold: true },
        { text: `${TYPE_EN[permit.type]} permit${permit.source === "sandbox" ? " (SANDBOX - not valid)" : ""}`, size: 14, bold: true },
        { text: `Permit no.: ${permit.permitNo}` },
        { text: `Name: ${p.nameEn}   Passport: ${p.passportNo}   Nationality: ${p.nationality}` },
        { text: `Date: ${permit.date}   Time: ${permit.start} - ${permit.end}` },
        { text: `Place: ${permit.type === "umrah" ? "The Holy Mosque, Makkah" : `The Rawdah, Prophet's Mosque, Madinah${permit.group ? ` (${permit.group})` : ""}`}` },
        { text: `Booking: ${permit.reference ?? ""}   Issued: ${permit.createdAt.slice(0, 16).replace("T", " ")}` },
        { text: "Show the permit QR in the Nusuk app or on your Saudi Trip digital card." },
      ]);
      await addIssuedDocument(userId, {
        id: `permit-${permit.id}-${p.applicationNo}`, person: p, type: "permit", title: `${TYPE_EN[permit.type]} ${permit.date} ${permit.start}`,
        bookingId: t.bookingId, applicationNo: p.applicationNo, data: pdf, contentType: "application/pdf",
        meta: { number: permit.permitNo, issueDate: permit.date, expiryDate: permit.date, status: "ISSUED" },
      });
    }
  }
  const names = permit.travellers.map((x) => x.nameEn).join(", ");
  await notifyUmrah(userId, {
    id: `umrah:permit:${permit.id}`, userId, kind: "umrah", bookingId: t.bookingId ?? "", reference: t.reference ?? "", createdAt: now.toISOString(),
    titleAr: `صدر تصريح ${TYPE_AR[permit.type]}`, titleEn: `${TYPE_EN[permit.type]} permit issued`,
    linesAr: [`${permit.date} من ${permit.start} إلى ${permit.end} — رقم التصريح ${permit.permitNo}.`, `المسافرون: ${names}. التصريح في المحفظة وعلى البطاقة الرقمية.`],
    linesEn: [`${permit.date}, ${permit.start}–${permit.end} — permit no. ${permit.permitNo}.`, `Travellers: ${names}. The permit is in your wallet and on the digital card.`],
    href: "/umrah", readAt: null, deletedAt: null, email: null, ...(t.demo ? { demo: true } : {}),
  });
  return toPublicPermit(permit);
}

async function cancel(p: StoredPermit, reason: "traveller" | "tripChanged", now: Date) {
  const nusuk = nusukProvider();
  if (nusuk && (p.source === "nusuk") === (nusuk.mode === "api")) {
    try {
      await nusuk.cancel(p.permitNo);
    } catch (e) {
      if (e instanceof NusukError && e.code === "unavailable") throw new PermitError("nusuk_unavailable", 502);
      // Already gone in Nusuk: cancel here too.
    }
  }
  const out = (await store().update<StoredPermit>(COL, p.id, (x) => ({ ...x, status: "cancelled", cancelReason: reason, cancelledAt: now.toISOString() })))!;
  for (const x of p.travellers) await retireIssuedDocument(p.userId, `permit-${p.id}-${x.applicationNo}`);
  return out;
}

/** The traveller cancels a permit (the seat is released in Nusuk). */
export async function cancelPermit(userId: string, id: string, now = new Date()): Promise<PublicPermit> {
  const p = await store().get<StoredPermit>(COL, id);
  if (!p || p.userId !== userId) throw new PermitError("notFound", 404);
  if (p.status !== "issued") throw new PermitError("alreadyCancelled", 409);
  return toPublicPermit(await cancel(p, "traveller", now));
}

/** Cancels permits whose trip was cancelled or no longer includes their day (the traveller is told). */
export async function reconcilePermits(userId: string, now = new Date()): Promise<number> {
  const active = (await store().findBy<StoredPermit>(COL, "userId", userId)).filter((p) => p.status === "issued" && p.tripKey !== "demo");
  if (!active.length) return 0;
  const trips = await tripContexts(userId, now);
  let n = 0;
  for (const p of active) {
    const t = trips.find((x) => x.key === p.tripKey);
    if (t && !t.cancelled && t.stayDays[p.type].includes(p.date)) continue;
    try {
      await cancel(p, "tripChanged", now);
    } catch {
      continue; // Nusuk unreachable: tried again next time
    }
    n++;
    const city = cityName(p.type === "umrah" ? "MKX" : "MED", "ar");
    await notifyUmrah(userId, {
      id: `umrah:permitCancelled:${p.id}`, userId, kind: "umrah", bookingId: p.tripKey, reference: p.reference ?? "", createdAt: now.toISOString(),
      titleAr: `أُلغي تصريح ${TYPE_AR[p.type]}`, titleEn: `${TYPE_EN[p.type]} permit cancelled`,
      linesAr: [`تغيّرت رحلتك فلم يعد موعد ${p.date} ضمن إقامتك في ${city}، فأُلغي التصريح ${p.permitNo} في نسك.`, "اختر موعدًا جديدًا من صفحة العمرة."],
      linesEn: [`Your trip changed and ${p.date} is no longer part of your stay, so permit ${p.permitNo} was cancelled in Nusuk.`, "Pick a new time on the Umrah page."],
      href: "/umrah", readAt: null, deletedAt: null, email: null, severity: "warning",
    });
  }
  return n;
}

/** QR (SVG) of a permit for display. */
export const permitQrSvg = (p: Pick<PublicPermit, "qr">) => QRCode.toString(p.qr, { type: "svg", margin: 1, errorCorrectionLevel: "M" });

/** Issued permits of one traveller (digital card). */
export async function travellerPermits(userId: string, tripKey: string, applicationNo: string): Promise<PublicPermit[]> {
  return (await store().findBy<StoredPermit>(COL, "userId", userId))
    .filter((p) => p.status === "issued" && p.tripKey === tripKey && p.travellers.some((x) => x.applicationNo === applicationNo))
    .sort((a, b) => a.date.localeCompare(b.date) || a.start.localeCompare(b.start))
    .map(toPublicPermit);
}
