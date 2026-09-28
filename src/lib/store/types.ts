/**
 * Minimal document store used by the repositories. Two implementations:
 * PostgreSQL (production, e.g. Vercel + Neon) and a local JSON file (development).
 */
export type Collection = "users" | "userEmails" | "bookings" | "sandboxPackages" | "config" | "travellers" | "outbox" | "wallet" | "files" | "places" | "favorites" | "seasons" | "eventOrders" | "eventSeats" | "trainOrders" | "trainSeats" | "restaurantBookings" | "restaurantSlots" | "esimOrders" | "chats" | "aiUsage" | "tripPlans" | "notifications" | "reviews" | "supportTickets" | "alertPrefs" | "loyalty" | "loyaltyCampaigns" | "guides" | "guideBookings" | "umrahPermits" | "transfers" | "rentals" | "transitOrders" | "transitTickets" | "transitTopups" | "rides" | "busOrders" | "busSeats" | "paymentIntents" | "savedCards" | "audioTours" | "audioClips" | "sessions" | "authTokens" | "authThrottle" | "userIdentities" | "families" | "familyLinks" | "tripShares" | "auditLog" | "consents" | "incidents" | "stays" | "flightOrders" | "evisaApps";

export interface DocStore {
  get<T>(col: Collection, id: string): Promise<T | null>;
  /** Documents whose top-level `field` equals `value`. */
  findBy<T>(col: Collection, field: string, value: string): Promise<T[]>;
  /** Inserts only if the id is new; returns false when it already exists. */
  insert<T>(col: Collection, id: string, doc: T): Promise<boolean>;
  put<T>(col: Collection, id: string, doc: T): Promise<void>;
  /** Atomic read-modify-write; returns null if the document does not exist. */
  update<T>(col: Collection, id: string, fn: (doc: T) => T): Promise<T | null>;
  /** Most recently updated documents of a collection (back-office listings). */
  list<T>(col: Collection, limit?: number): Promise<T[]>;
  /** Every document of a collection with its id (maintenance jobs such as data retention). */
  entries<T>(col: Collection): Promise<{ id: string; doc: T }[]>;
  /** Removes the document; returns false when it did not exist. */
  delete(col: Collection, id: string): Promise<boolean>;
}
