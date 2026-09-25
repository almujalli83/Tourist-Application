import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { createFileStore } from "@/lib/store/file-store";
import { createPgStore } from "@/lib/store/pg-store";
import type { DocStore } from "@/lib/store/types";

function suite(name: string, make: () => DocStore) {
  describe(name, () => {
    const s = make();
    const id = `u-${Math.random().toString(36).slice(2)}`;

    it("inserts once, reads, finds and updates atomically", async () => {
      expect(await s.insert("users", id, { id, userId: "owner-1", n: 0 })).toBe(true);
      expect(await s.insert("users", id, { id, n: 99 })).toBe(false);
      expect(await s.get("users", id)).toMatchObject({ n: 0 });
      expect((await s.findBy("users", "userId", "owner-1")).some((d) => (d as { id: string }).id === id)).toBe(true);
      await Promise.all(Array.from({ length: 10 }, () => s.update<{ n: number }>("users", id, (d) => ({ ...d, n: d.n + 1 }))));
      expect(await s.get("users", id)).toMatchObject({ n: 10 });
      expect(await s.update("users", "missing", (d) => d)).toBeNull();
      await s.put("users", id, { id, n: -1 });
      expect(await s.get("users", id)).toMatchObject({ n: -1 });
      expect((await s.list<{ id: string }>("users")).some((d) => d.id === id)).toBe(true);
      expect(await s.delete("users", id)).toBe(true);
      expect(await s.delete("users", id)).toBe(false);
      expect(await s.get("users", id)).toBeNull();
    });
  });
}

suite("file store", () => createFileStore(path.join(mkdtempSync(path.join(tmpdir(), "st-")), "db.json")));

// Runs against a real Postgres when TEST_DATABASE_URL is provided.
if (process.env.TEST_DATABASE_URL) suite("postgres store", () => createPgStore(process.env.TEST_DATABASE_URL!));
