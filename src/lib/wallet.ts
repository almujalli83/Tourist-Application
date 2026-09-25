/**
 * Digital wallet (service 3): each account's travel documents, grouped per traveller.
 *
 * - The account that bought a package manages the documents of everyone in it; travellers are
 *   identified by nationality + passport number (saved travellers and booking applicants).
 * - Uploaded: passport, personal photo, national ID / residence permit (and visa / insurance
 *   files received by email). Automatic: the eVisa and insurance policy once issued (central
 *   platform connector), and the booking documents (generated from the booking).
 * - Files are encrypted before storage; metadata is encrypted at rest; only the owner sees them.
 */
import { randomUUID } from "node:crypto";
import type { StoredBooking } from "./bookings/types";
import { fetchInsuranceDocument, fetchVisaDocument, type TravelDocumentRequest } from "./central-platform";
import { decryptJson, encryptJson } from "./data-crypto";
import { isValidISODate } from "./dates";
import { deleteFile, readFile, saveFile, sniffContentType, type StoredFileRef } from "./files";
import { listBookingsByUser } from "./repo";
import { listWithKeys, passportKey } from "./saved-travellers-repo";
import { store } from "./store";

export const WALLET_DOC_TYPES = ["passport", "photo", "nationalId", "residence", "visa", "insurance", "other"] as const;
export type WalletDocType = (typeof WALLET_DOC_TYPES)[number];
export const UPLOAD_MAX_BYTES = 4 * 1024 * 1024; // below the 4.5 MB request limit of serverless functions

export interface WalletDocMeta {
  number?: string;
  issueDate?: string;
  expiryDate?: string;
  status?: string;
}

export interface WalletDoc {
  id: string;
  personKey: string;
  personName: string;
  type: WalletDocType;
  title: string;
  source: "upload" | "central";
  bookingId: string | null;
  applicationNo: string | null;
  file: StoredFileRef | null;
  meta: WalletDocMeta;
  createdAt: string;
  /** Deleted by the user: kept as a marker so automatic documents are not added again. */
  deleted?: boolean;
}

interface StoredWalletDoc {
  id: string;
  userId: string;
  createdAt: string;
  enc: string;
}

/** What the browser receives (no storage references). */
export type PublicWalletDoc = Omit<WalletDoc, "file" | "deleted"> & { hasFile: boolean; contentType: string | null; size: number | null };

const toPublic = (d: WalletDoc): PublicWalletDoc => {
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const { file, deleted, ...rest } = d;
  return { ...rest, hasFile: !!file, contentType: file?.contentType ?? null, size: file?.size ?? null };
};

async function putDoc(userId: string, d: WalletDoc) {
  await store().put<StoredWalletDoc>("wallet", d.id, { id: d.id, userId, createdAt: d.createdAt, enc: encryptJson(d) });
}

async function listDocs(userId: string): Promise<WalletDoc[]> {
  const rows = await store().findBy<StoredWalletDoc>("wallet", "userId", userId);
  return rows.map((r) => decryptJson<WalletDoc>(r.enc)).filter((d): d is WalletDoc => !!d);
}

export async function getWalletDoc(userId: string, id: string): Promise<WalletDoc | null> {
  const row = await store().get<StoredWalletDoc>("wallet", id);
  if (!row || row.userId !== userId) return null;
  const d = decryptJson<WalletDoc>(row.enc);
  return d && !d.deleted ? d : null;
}

/* ------------------------------------------------------------ people */

export interface WalletPerson {
  key: string;
  nameEn: string;
  nationality: string;
  passportNoMasked: string;
  savedTravellerId: string | null;
  hasSavedPassportImage: boolean;
  hasSavedPhoto: boolean;
  passportExpiryDate: string | null;
  bookings: { id: string; reference: string; departureDate: string; returnDate: string; applicationNo: string }[];
}

const mask = (pn: string) => (pn.length > 4 ? `•••${pn.slice(-4)}` : pn);

/** Everyone whose documents this account manages: saved travellers and travellers it booked for. */
export async function walletPeople(userId: string, bookings?: StoredBooking[]): Promise<WalletPerson[]> {
  const [saved, all] = await Promise.all([listWithKeys(userId), bookings ? Promise.resolve(bookings) : listBookingsByUser(userId)]);
  const people = new Map<string, WalletPerson>();
  for (const s of saved) {
    people.set(s.passportKey, {
      key: s.passportKey, nameEn: s.nameEn, nationality: s.nationality, passportNoMasked: s.passportNoMasked, savedTravellerId: s.id,
      hasSavedPassportImage: s.hasPassportImage, hasSavedPhoto: s.hasPhoto, passportExpiryDate: s.passportExpiryDate || null, bookings: [],
    });
  }
  for (const b of all) {
    if (b.status === "CANCELLED") continue;
    for (const a of b.applicants) {
      const key = passportKey(a);
      const p = people.get(key) ?? {
        key, nameEn: a.nameEn, nationality: a.nationality, passportNoMasked: mask(a.passportNo), savedTravellerId: null,
        hasSavedPassportImage: false, hasSavedPhoto: false, passportExpiryDate: null, bookings: [],
      };
      p.bookings.push({ id: b.id, reference: b.reference, departureDate: b.criteria.departureDate, returnDate: b.criteria.returnDate, applicationNo: a.applicationNo });
      people.set(key, p);
    }
  }
  return [...people.values()].sort((x, y) => x.nameEn.localeCompare(y.nameEn));
}

/* ---------------------------------------------------- automatic docs */

/**
 * Adds the eVisa and insurance policy of every issued visa in the account's bookings (from the
 * central platform). Idempotent: one visa and one insurance document per application.
 */
export async function syncIssuedDocuments(userId: string, bookings: StoredBooking[]): Promise<number> {
  let added = 0;
  const s = store();
  for (const b of bookings) {
    for (const a of b.applicants) {
      if (!a.visaNumber) continue;
      const req: TravelDocumentRequest = {
        applicationNo: a.applicationNo, visaNumber: a.visaNumber, nameEn: a.nameEn, passportNo: a.passportNo,
        nationality: a.nationality, visaIssueDate: a.visaIssueDate, visaExpiryDate: a.visaExpiryDate,
      };
      const kinds = [
        { type: "visa" as const, id: `visa-${b.id}-${a.applicationNo}`, fetch: fetchVisaDocument, meta: { number: a.visaNumber, issueDate: a.visaIssueDate ?? undefined, expiryDate: a.visaExpiryDate ?? undefined, status: a.visaStatus ?? undefined } },
        { type: "insurance" as const, id: `insurance-${b.id}-${a.applicationNo}`, fetch: fetchInsuranceDocument, meta: { number: a.visaNumber, expiryDate: a.visaExpiryDate ?? undefined, status: a.insuranceStatus ?? undefined } },
      ];
      for (const k of kinds) {
        if (k.type === "insurance" && a.insuranceStatus !== "ISSUED") continue;
        if (await s.get("wallet", k.id)) continue; // already added (or deleted by the user)
        const fetched = await k.fetch(req);
        const file = fetched ? await saveFile(userId, fetched.data, fetched.contentType) : null;
        const doc: WalletDoc = {
          id: k.id, personKey: passportKey(a), personName: a.nameEn, type: k.type, title: "", source: "central",
          bookingId: b.id, applicationNo: a.applicationNo, file, meta: k.meta, createdAt: new Date().toISOString(),
        };
        const row: StoredWalletDoc = { id: doc.id, userId, createdAt: doc.createdAt, enc: encryptJson(doc) };
        if (await s.insert("wallet", doc.id, row)) added++;
        else if (file) await deleteFile(file); // another request added it first
      }
    }
  }
  return added;
}

/* ------------------------------------------------------------ overview */

export async function walletOverview(userId: string) {
  const bookings = await listBookingsByUser(userId);
  await syncIssuedDocuments(userId, bookings);
  const [people, docs] = await Promise.all([walletPeople(userId, bookings), listDocs(userId)]);
  const live = docs.filter((d) => !d.deleted);
  return {
    people: people.map((p) => ({ ...p, documents: live.filter((d) => d.personKey === p.key).map(toPublic).sort((a, b) => a.type.localeCompare(b.type) || b.createdAt.localeCompare(a.createdAt)) })),
  };
}

/* ------------------------------------------------------------ uploads */

export class WalletError extends Error {}

export async function uploadWalletDocument(
  userId: string,
  input: { personKey: string; type: string; data: Buffer; title?: string; meta?: WalletDocMeta },
): Promise<PublicWalletDoc> {
  if (!(WALLET_DOC_TYPES as readonly string[]).includes(input.type)) throw new WalletError("invalidType");
  if (!input.data.length) throw new WalletError("emptyFile");
  if (input.data.length > UPLOAD_MAX_BYTES) throw new WalletError("tooLarge");
  const contentType = sniffContentType(input.data);
  if (!contentType) throw new WalletError("unsupportedFile");
  const person = (await walletPeople(userId)).find((p) => p.key === input.personKey);
  if (!person) throw new WalletError("unknownPerson");
  const meta: WalletDocMeta = {};
  const m = input.meta ?? {};
  if (m.number?.trim()) meta.number = m.number.trim().slice(0, 40);
  if (m.issueDate && isValidISODate(m.issueDate)) meta.issueDate = m.issueDate;
  if (m.expiryDate && isValidISODate(m.expiryDate)) meta.expiryDate = m.expiryDate;
  const file = await saveFile(userId, input.data, contentType);
  const doc: WalletDoc = {
    id: randomUUID(), personKey: person.key, personName: person.nameEn, type: input.type as WalletDocType,
    title: (input.title ?? "").trim().slice(0, 80), source: "upload", bookingId: null, applicationNo: null,
    file, meta, createdAt: new Date().toISOString(),
  };
  await putDoc(userId, doc);
  return toPublic(doc);
}

export async function readWalletFile(userId: string, id: string) {
  const doc = await getWalletDoc(userId, id);
  if (!doc?.file) return null;
  const data = await readFile(doc.file);
  return data ? { doc, data } : null;
}

export async function deleteWalletDocument(userId: string, id: string): Promise<boolean> {
  const doc = await getWalletDoc(userId, id);
  if (!doc) return false;
  if (doc.file) await deleteFile(doc.file);
  if (doc.source === "central") await putDoc(userId, { ...doc, file: null, deleted: true }); // do not add it again
  else await store().delete("wallet", id);
  return true;
}

/** Validity badge of a document: expired, expiring within 30 days, valid, or none. */
export function expiryState(expiryDate: string | undefined | null, today: string): "expired" | "expiring" | "valid" | "none" {
  if (!expiryDate || !isValidISODate(expiryDate)) return "none";
  if (expiryDate < today) return "expired";
  const soon = new Date(Date.parse(today) + 30 * 86_400_000).toISOString().slice(0, 10);
  return expiryDate <= soon ? "expiring" : "valid";
}
