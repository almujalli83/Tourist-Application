import { afterEach, describe, expect, it, vi } from "vitest";
import { ensureSecrets, resetSecretsForTests, secretFor, secretSource } from "@/lib/secrets";

const ENV = { ...process.env };

afterEach(() => {
  process.env = { ...ENV };
  vi.unstubAllEnvs();
  resetSecretsForTests();
});

describe("signing secret", () => {
  it("uses SESSION_SECRET when set (trimmed) and derives separate keys per purpose", async () => {
    process.env.SESSION_SECRET = "  my-secret  ";
    await ensureSecrets();
    expect(secretSource()).toBe("env");
    expect(secretFor("session")).not.toBe(secretFor("offers"));
  });

  it("refuses to sign in production without any secret source", async () => {
    vi.stubEnv("NODE_ENV", "production");
    process.env.SESSION_SECRET = "";
    delete process.env.DATABASE_URL;
    delete process.env.POSTGRES_URL;
    await ensureSecrets();
    expect(secretSource()).toBe("missing");
    expect(() => secretFor("session")).toThrow(/SESSION_SECRET/);
  });

  it.runIf(!!process.env.TEST_DATABASE_URL)("generates one shared secret in the database when SESSION_SECRET is empty", async () => {
    vi.stubEnv("NODE_ENV", "production");
    process.env.SESSION_SECRET = "";
    process.env.DATABASE_URL = process.env.TEST_DATABASE_URL;
    await ensureSecrets();
    expect(secretSource()).toBe("database");
    const first = secretFor("offers");
    resetSecretsForTests(); // simulate another server instance
    await ensureSecrets();
    expect(secretFor("offers")).toBe(first);
  });
});
