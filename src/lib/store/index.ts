import path from "node:path";
import { createFileStore } from "./file-store";
import { createPgStore } from "./pg-store";
import type { DocStore } from "./types";

export type { Collection, DocStore } from "./types";

/** Postgres when DATABASE_URL (or Vercel's POSTGRES_URL) is set, otherwise a local JSON file. */
export function databaseUrl(): string | undefined {
  return process.env.DATABASE_URL || process.env.POSTGRES_URL || undefined;
}

const g = globalThis as unknown as { __docStore?: DocStore };

export function store(): DocStore {
  if (g.__docStore) return g.__docStore;
  const url = databaseUrl();
  g.__docStore = url
    ? createPgStore(url)
    : createFileStore(process.env.DB_FILE ?? path.join(process.cwd(), "data", "db.json"));
  return g.__docStore;
}
