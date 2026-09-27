/**
 * Other ways to sign in linked to an account: Google, Apple, Nafath and the verified mobile number.
 * Each identity (provider + subject) belongs to one account.
 */
import { createHash } from "node:crypto";
import { secretFor } from "../secrets";
import { store } from "../store";

export type IdentityProvider = "google" | "apple" | "nafath" | "phone";

export interface Identity {
  id: string;
  userId: string;
  provider: IdentityProvider;
  /** Shown to the user (masked email, number or ID). */
  label: string;
  sandbox?: boolean;
  createdAt: string;
}

/** National ID numbers are kept only as keyed hashes. */
export const hashSubject = (v: string) => createHash("sha256").update(`${secretFor("data")}|${v}`).digest("hex").slice(0, 40);

export const identityId = (provider: IdentityProvider, subject: string, sandbox = false) => `${sandbox ? "sandbox-" : ""}${provider}:${subject}`;

export async function findIdentity(id: string): Promise<Identity | null> {
  return store().get<Identity>("userIdentities", id);
}

/** Links an identity to an account; false when it already belongs to another account. */
export async function linkIdentity(i: Omit<Identity, "createdAt">): Promise<boolean> {
  const cur = await findIdentity(i.id);
  if (cur) return cur.userId === i.userId;
  return store().insert<Identity>("userIdentities", i.id, { ...i, createdAt: new Date().toISOString() });
}

export async function listIdentities(userId: string): Promise<Identity[]> {
  return (await store().findBy<Identity>("userIdentities", "userId", userId)).sort((a, b) => a.createdAt.localeCompare(b.createdAt));
}

export async function unlinkIdentity(userId: string, id: string): Promise<boolean> {
  const cur = await findIdentity(id);
  if (!cur || cur.userId !== userId) return false;
  return store().delete("userIdentities", id);
}

export async function removeUserIdentities(userId: string, provider?: IdentityProvider): Promise<void> {
  for (const i of await listIdentities(userId)) if (!provider || i.provider === provider) await store().delete("userIdentities", i.id);
}

export const maskEmail = (e: string) => e.replace(/^(.)(.*)(@.*)$/, (_m, a: string, b: string, c: string) => `${a}${"•".repeat(Math.min(b.length, 6))}${c}`);
export const maskTail = (v: string, keep = 4) => `${"•".repeat(Math.max(0, Math.min(v.length - keep, 6)))}${v.slice(-keep)}`;
