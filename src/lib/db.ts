/**
 * Minimal JSON-file persistence for the MVP (users, bookings, sandbox MT state).
 * Behind a small repository API so it can be swapped for PostgreSQL without touching callers.
 */
import { promises as fs } from "node:fs";
import path from "node:path";
import type { StoredBooking } from "./bookings/types";
import type { StoredUser } from "./auth/types";

export interface SandboxPackage {
  packageId: string;
  submittedAt: string;
  applications: { applicationNo: string; name: string; countryId: string; passportNo: string }[];
  cancelled?: boolean;
}

interface Schema {
  users: StoredUser[];
  bookings: StoredBooking[];
  sandboxPackages: SandboxPackage[];
}

const DB_FILE = process.env.DB_FILE ?? path.join(process.cwd(), "data", "db.json");
const EMPTY: Schema = { users: [], bookings: [], sandboxPackages: [] };

let queue: Promise<unknown> = Promise.resolve();

async function load(): Promise<Schema> {
  try {
    const raw = await fs.readFile(DB_FILE, "utf8");
    return { ...EMPTY, ...JSON.parse(raw) };
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === "ENOENT") return structuredClone(EMPTY);
    throw err;
  }
}

async function save(data: Schema) {
  await fs.mkdir(path.dirname(DB_FILE), { recursive: true });
  const tmp = `${DB_FILE}.${process.pid}.tmp`;
  await fs.writeFile(tmp, JSON.stringify(data, null, 2), "utf8");
  await fs.rename(tmp, DB_FILE);
}

/** Runs a read-modify-write transaction serialised within the process. */
export function transact<T>(fn: (db: Schema) => T | Promise<T>): Promise<T> {
  const run = queue.then(async () => {
    const db = await load();
    const result = await fn(db);
    await save(db);
    return result;
  });
  queue = run.catch(() => undefined);
  return run;
}

export async function read<T>(fn: (db: Schema) => T): Promise<T> {
  await queue.catch(() => undefined);
  return fn(await load());
}
