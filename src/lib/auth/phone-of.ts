import type { StoredUser } from "./types";

/** The account's mobile number (individual or company contact). */
export const phoneOf = (u: Pick<StoredUser, "individual" | "company">): string => (u.individual?.phone || u.company?.phone || "").trim();
