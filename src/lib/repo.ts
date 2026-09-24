/** Repositories over the document store (users, bookings, sandbox MT state). */
import type { StoredUser } from "./auth/types";
import type { StoredBooking } from "./bookings/types";
import { store } from "./store";

export interface SandboxPackage {
  packageId: string;
  submittedAt: string;
  applications: { applicationNo: string; name: string; countryId: string; passportNo: string }[];
  cancelled?: boolean;
}

/* ---------- users ---------- */

export function getUserById(id: string) {
  return store().get<StoredUser>("users", id);
}

export async function getUserByEmail(email: string) {
  const ref = await store().get<{ userId: string }>("userEmails", email.toLowerCase());
  return ref ? getUserById(ref.userId) : null;
}

/** Creates a user; returns null when the email is already registered. */
export async function createUser(user: StoredUser): Promise<StoredUser | null> {
  const s = store();
  if (!(await s.insert("userEmails", user.email.toLowerCase(), { userId: user.id }))) return null;
  await s.put("users", user.id, user);
  return user;
}

export function updateUser(id: string, fn: (u: StoredUser) => StoredUser) {
  return store().update<StoredUser>("users", id, fn);
}

/* ---------- bookings ---------- */

export function saveBooking(b: StoredBooking) {
  return store().put("bookings", b.id, b);
}

export async function listBookingsByUser(userId: string) {
  const list = await store().findBy<StoredBooking>("bookings", "userId", userId);
  return list.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

export async function getBookingForUser(userId: string, id: string) {
  const b = await store().get<StoredBooking>("bookings", id);
  return b && b.userId === userId ? b : null;
}

export function updateBooking(id: string, fn: (b: StoredBooking) => StoredBooking) {
  return store().update<StoredBooking>("bookings", id, fn);
}

/* ---------- sandbox MT packages ---------- */

export function getSandboxPackage(packageId: string) {
  return store().get<SandboxPackage>("sandboxPackages", packageId);
}

/** Creates the package if missing, then applies `fn` atomically. */
export async function upsertSandboxPackage(packageId: string, fn: (p: SandboxPackage) => SandboxPackage) {
  const s = store();
  const updated = await s.update<SandboxPackage>("sandboxPackages", packageId, fn);
  if (updated) return updated;
  const fresh: SandboxPackage = { packageId, submittedAt: new Date().toISOString(), applications: [] };
  if (await s.insert("sandboxPackages", packageId, fn(fresh))) return fn(fresh);
  return (await s.update<SandboxPackage>("sandboxPackages", packageId, fn))!;
}

export function updateSandboxPackage(packageId: string, fn: (p: SandboxPackage) => SandboxPackage) {
  return store().update<SandboxPackage>("sandboxPackages", packageId, fn);
}
