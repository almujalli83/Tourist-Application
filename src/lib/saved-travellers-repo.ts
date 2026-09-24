/** Storage of saved travellers: encrypted at rest, scoped to their owner. */
import { randomUUID } from "node:crypto";
import { decryptJson, encryptJson } from "./data-crypto";
import {
  MAX_SAVED_TRAVELLERS, summarize,
  type SavedTraveller, type SavedTravellerData, type SavedTravellerSummary,
} from "./saved-travellers";
import { store } from "./store";

interface StoredSavedTraveller {
  id: string;
  userId: string;
  createdAt: string;
  updatedAt: string;
  /** Encrypted SavedTravellerSummary + unmasked passport number (kept small for listing). */
  summary: string;
  /** Encrypted SavedTravellerData. */
  data: string;
}

type SummaryWithKey = SavedTravellerSummary & { passportKey: string };

const passportKey = (d: SavedTravellerData) => `${d.nationality}:${d.passportNo.toUpperCase()}`;

function toStored(userId: string, id: string, d: SavedTravellerData, createdAt: string): StoredSavedTraveller {
  const updatedAt = new Date().toISOString();
  const summary: SummaryWithKey = { ...summarize(id, d, updatedAt), passportKey: passportKey(d) };
  return { id, userId, createdAt, updatedAt, summary: encryptJson(summary), data: encryptJson(d) };
}

async function listWithKeys(userId: string): Promise<SummaryWithKey[]> {
  const docs = await store().findBy<StoredSavedTraveller>("travellers", "userId", userId);
  return docs
    .map((d) => decryptJson<SummaryWithKey>(d.summary))
    .filter((s): s is SummaryWithKey => !!s)
    .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
}

export async function listSavedTravellers(userId: string): Promise<SavedTravellerSummary[]> {
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  return (await listWithKeys(userId)).map(({ passportKey, ...s }) => s);
}

export async function getSavedTraveller(userId: string, id: string): Promise<SavedTraveller | null> {
  const doc = await store().get<StoredSavedTraveller>("travellers", id);
  if (!doc || doc.userId !== userId) return null;
  const data = decryptJson<SavedTravellerData>(doc.data);
  return data ? { ...data, id, updatedAt: doc.updatedAt } : null;
}

/**
 * Saves a new traveller. A traveller with the same nationality and passport number is updated
 * instead of duplicated. Returns "limit" when the account already holds the maximum.
 */
export async function createSavedTraveller(userId: string, d: SavedTravellerData): Promise<SavedTravellerSummary | "limit"> {
  const existing = await listWithKeys(userId);
  const same = existing.find((s) => s.passportKey === passportKey(d));
  if (same) return (await updateSavedTraveller(userId, same.id, d))!;
  if (existing.length >= MAX_SAVED_TRAVELLERS) return "limit";
  const id = randomUUID();
  const doc = toStored(userId, id, d, new Date().toISOString());
  await store().put("travellers", id, doc);
  return summarize(id, d, doc.updatedAt);
}

export async function updateSavedTraveller(userId: string, id: string, d: SavedTravellerData): Promise<SavedTravellerSummary | null> {
  const s = store();
  const doc = await s.get<StoredSavedTraveller>("travellers", id);
  if (!doc || doc.userId !== userId) return null;
  const next = await s.update<StoredSavedTraveller>("travellers", id, (cur) => toStored(userId, id, d, cur.createdAt));
  return next ? summarize(id, d, next.updatedAt) : null;
}

export async function deleteSavedTraveller(userId: string, id: string): Promise<boolean> {
  const s = store();
  const doc = await s.get<StoredSavedTraveller>("travellers", id);
  if (!doc || doc.userId !== userId) return false;
  return s.delete("travellers", id);
}
