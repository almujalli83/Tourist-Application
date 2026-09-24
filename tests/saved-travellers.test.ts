import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { decryptJson, encryptJson } from "@/lib/data-crypto";
import { passportStatus, pickSavedData, sanitizeSavedTraveller, validateSavedTraveller } from "@/lib/saved-travellers";
import { validAdult } from "./fixtures";

const ENV = { ...process.env };
const g = globalThis as unknown as { __docStore?: unknown };

beforeAll(() => {
  delete process.env.DATABASE_URL;
  delete process.env.POSTGRES_URL;
  process.env.DB_FILE = path.join(mkdtempSync(path.join(tmpdir(), "saved-")), "db.json");
  process.env.DATA_ENCRYPTION_KEY = "test-key-1";
  g.__docStore = undefined;
});
afterAll(() => {
  process.env = { ...ENV };
  g.__docStore = undefined;
});

describe("data encryption", () => {
  it("round-trips and rejects tampering or another key", () => {
    const box = encryptJson({ passportNo: "G88201134H" });
    expect(box).not.toContain("G88201134H");
    expect(decryptJson(box)).toEqual({ passportNo: "G88201134H" });
    expect(decryptJson(box.slice(0, -2) + "AA")).toBeNull();
    process.env.DATA_ENCRYPTION_KEY = "another-key";
    expect(decryptJson(box)).toBeNull();
    process.env.DATA_ENCRYPTION_KEY = "test-key-1";
  });
});

describe("saved traveller data", () => {
  it("keeps only reusable fields — never security or insurance answers", () => {
    const d = sanitizeSavedTraveller({ ...validAdult(), gender: "9", personPhoto: "javascript:alert(1)", extra: "x" });
    expect(d).not.toHaveProperty("security");
    expect(d).not.toHaveProperty("insurance");
    expect(d).not.toHaveProperty("sponsorIndex");
    expect(d).not.toHaveProperty("extra");
    expect(d.gender).toBe("");
    expect(d.personPhoto).toBe("");
    expect(d.passportImage.startsWith("data:image/jpeg;base64,")).toBe(true);
  });

  it("requires only the core fields and an unexpired passport", () => {
    const today = "2026-09-24";
    expect(validateSavedTraveller(pickSavedData(validAdult()), today)).toEqual({});
    const minimal = sanitizeSavedTraveller({ firstNameEn: "SARA", familyNameEn: "ALI", nationality: "IN", passportNo: "Z1234567" });
    expect(validateSavedTraveller(minimal, today)).toEqual({});
    expect(validateSavedTraveller(sanitizeSavedTraveller({ firstNameEn: "SARA" }), today)).toMatchObject({
      familyNameEn: "required", nationality: "required", passportNo: "required",
    });
    const expired = pickSavedData(validAdult({ passportIssueDate: "2016-01-01", passportExpiryDate: "2026-01-01" }));
    expect(validateSavedTraveller(expired, today)).toEqual({ passportExpiryDate: "passportExpired" });
    // A child's saved record is valid too (no passenger-type or sponsor rules).
    expect(validateSavedTraveller(pickSavedData(validAdult({ birthDate: "2020-05-05", job: "Student" })), today)).toEqual({});
  });

  it("classifies passports against the trip", () => {
    expect(passportStatus("2026-01-01", "2026-09-24")).toBe("expired");
    expect(passportStatus("2027-01-01", "2026-09-24", "2026-10-10")).toBe("insufficient");
    expect(passportStatus("2030-01-01", "2026-09-24", "2026-10-10")).toBe("ok");
    expect(passportStatus("", "2026-09-24")).toBe("unknown");
  });
});

describe("saved traveller repository", () => {
  it("stores encrypted, dedupes by passport and scopes to the owner", async () => {
    const repo = await import("@/lib/saved-travellers-repo");
    const { store } = await import("@/lib/store");
    const d = pickSavedData(validAdult());
    const a = await repo.createSavedTraveller("user-1", d);
    if (a === "limit") throw new Error("limit");
    expect(a.passportNoMasked).toBe("•••134H");

    const raw = await store().get<Record<string, string>>("travellers", a.id);
    expect(JSON.stringify(raw)).not.toContain("G88201134H");
    expect(JSON.stringify(raw)).not.toContain("FARAZ");

    const again = await repo.createSavedTraveller("user-1", { ...d, job: "Engineer" });
    expect(again).toMatchObject({ id: a.id });
    expect(await repo.listSavedTravellers("user-1")).toHaveLength(1);
    expect((await repo.getSavedTraveller("user-1", a.id))?.job).toBe("Engineer");

    expect(await repo.getSavedTraveller("user-2", a.id)).toBeNull();
    expect(await repo.updateSavedTraveller("user-2", a.id, d)).toBeNull();
    expect(await repo.deleteSavedTraveller("user-2", a.id)).toBe(false);
    expect(await repo.listSavedTravellers("user-2")).toEqual([]);

    expect(await repo.deleteSavedTraveller("user-1", a.id)).toBe(true);
    expect(await repo.listSavedTravellers("user-1")).toEqual([]);
  });
});
