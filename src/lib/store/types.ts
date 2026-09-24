/**
 * Minimal document store used by the repositories. Two implementations:
 * PostgreSQL (production, e.g. Vercel + Neon) and a local JSON file (development).
 */
export type Collection = "users" | "userEmails" | "bookings" | "sandboxPackages" | "config";

export interface DocStore {
  get<T>(col: Collection, id: string): Promise<T | null>;
  /** Documents whose top-level `field` equals `value`. */
  findBy<T>(col: Collection, field: string, value: string): Promise<T[]>;
  /** Inserts only if the id is new; returns false when it already exists. */
  insert<T>(col: Collection, id: string, doc: T): Promise<boolean>;
  put<T>(col: Collection, id: string, doc: T): Promise<void>;
  /** Atomic read-modify-write; returns null if the document does not exist. */
  update<T>(col: Collection, id: string, fn: (doc: T) => T): Promise<T | null>;
}
