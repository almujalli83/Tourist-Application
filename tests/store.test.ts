import { mkdtempSync, readFileSync, writeFileSync } from "node:fs";
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

describe("file store cache", () => {
  it("sees edits made to the file by another process, and drops a write that failed", async () => {
    const file = path.join(mkdtempSync(path.join(tmpdir(), "st-")), "db.json");
    const s = createFileStore(file);
    await s.put("users", "a", { id: "a", n: 1 });
    expect(await s.get("users", "a")).toMatchObject({ n: 1 });
    const d = JSON.parse(readFileSync(file, "utf8"));
    d.users.a.n = 2;
    d.users.b = { id: "b", n: 3, pad: "x".repeat(10) };
    writeFileSync(file, JSON.stringify(d));
    expect(await s.get("users", "a")).toMatchObject({ n: 2 });
    expect(await s.get("users", "b")).toMatchObject({ n: 3 });
    await expect(s.update<{ n: number }>("users", "a", (x) => { x.n = 99; throw new Error("boom"); })).rejects.toThrow("boom");
    expect(await s.get("users", "a")).toMatchObject({ n: 2 });
  });
});

// Runs against a real Postgres when TEST_DATABASE_URL is provided.
if (process.env.TEST_DATABASE_URL) suite("postgres store", () => createPgStore(process.env.TEST_DATABASE_URL!));
