import { beforeEach, describe, expect, it, vi } from "vitest";
import type { PublicUser } from "@/lib/auth/types";

const ask = vi.fn();
let live = false;
vi.mock("@/lib/assistant/claude", () => ({
  aiConfigured: () => live,
  askClaude: (...args: unknown[]) => ask(...args),
  AiUnavailableError: class extends Error {},
}));

const { cleanHistory, clearHistory, getHistory, reply, sandboxReply } = await import("@/lib/assistant/assistant");
const { takeQuota, quotaLeft } = await import("@/lib/assistant/usage");
const { translateImage, translateText } = await import("@/lib/assistant/translate");

const run = Math.random().toString(36).slice(2, 8);
const user = (id: string): PublicUser => ({ id, email: `${id}@example.com`, accountType: "individual", individual: { fullName: "Sara Ali", phone: "+966500000000", nationality: "EG" }, preferredLocale: "ar", preferredCurrency: "SAR", createdAt: "2026-01-01T00:00:00Z" });

beforeEach(() => {
  live = false;
  ask.mockReset();
});

describe("assistant (sandbox)", () => {
  it("routes questions to the right page with in-app links", () => {
    expect(sandboxReply("أبغى مطعم في جدة", "ar", "")).toContain("](/ar/restaurants)");
    expect(sandboxReply("Any concerts this weekend?", "en", "")).toContain("](/en/events)");
    expect(sandboxReply("قطار الحرمين", "ar", "")).toContain("/ar/trains");
    expect(sandboxReply("need internet", "en", "")).toContain("/en/esim");
    expect(sandboxReply("متى رحلتي؟", "ar", "Signed-in\nPackage TA-1 (SUBMITTED): 2026-10-10 → 2026-10-15")).toContain("Package TA-1");
    expect(sandboxReply("hello", "en", "")).toContain("sandbox");
  });

  it("keeps signed-in conversations and not visitors'", async () => {
    const u = user(`as-${run}`);
    const r = await reply({ user: u, locale: "ar", message: "مطعم" });
    expect(r.reply).toContain("/ar/restaurants");
    const h = await getHistory(u.id);
    expect(h.map((m) => m.role)).toEqual(["user", "assistant"]);
    await clearHistory(u.id);
    expect(await getHistory(u.id)).toEqual([]);
    await reply({ user: null, locale: "en", message: "events" });
    expect(cleanHistory([{ role: "system", content: "x" }, { role: "user", content: "hi" }, "bad"])).toHaveLength(1);
  });
});

describe("assistant (Claude)", () => {
  it("sends a cached stable prompt, the account context and alternating history", async () => {
    live = true;
    ask.mockResolvedValue("Your trip starts on 10 October. [My bookings](/en/account)");
    const u = user(`live-${run}`);
    const out = await reply({ user: null, locale: "en", message: "When is my trip?", guestHistory: [
      { role: "assistant", content: "stray", at: "" },
      { role: "user", content: "Hi", at: "" },
      { role: "assistant", content: "Hello!", at: "" },
    ] });
    expect(out).toEqual({ reply: "Your trip starts on 10 October. [My bookings](/en/account)", declined: false });
    const req = ask.mock.calls[0][0];
    expect(req.system[0].cache_control).toEqual({ type: "ephemeral" });
    expect(req.system[0].text).toContain("read-only");
    expect(req.system[0].text).toContain("ruh-najd-heritage");
    expect(req.system[1].text).toContain("not signed in");
    expect(req.messages.map((m: { role: string }) => m.role)).toEqual(["user", "assistant", "user"]);

    ask.mockResolvedValue(null);
    const declined = await reply({ user: u, locale: "ar", message: "x" });
    expect(declined.declined).toBe(true);
    expect(declined.reply).toContain("عذرًا");
    const req2 = ask.mock.calls[1][0];
    expect(req2.system[1].text).toContain("Sara Ali");
    expect(req2.system[1].text).toContain("No bookings yet.");
  });

  it("translates text and photos", async () => {
    live = true;
    ask.mockResolvedValue("Hello");
    expect(await translateText("مرحبا", "ar", "en")).toBe("Hello");
    expect(ask.mock.calls[0][0].messages[0].content).toContain("from Arabic to English");
    await expect(translateText("  ", "auto", "en")).rejects.toThrow("empty");
    await expect(translateImage("data:text/html;base64,AAAA", "en")).rejects.toThrow("invalidImage");
    ask.mockResolvedValue("Coffee — 15 SAR");
    expect(await translateImage("data:image/png;base64,iVBORw0KGgo=", "en")).toBe("Coffee — 15 SAR");
    expect(ask.mock.calls[1][0].messages[0].content[0]).toMatchObject({ type: "image", source: { type: "base64", media_type: "image/png" } });
    live = false;
    expect(await translateText("hi", "en", "ar")).toBe("[ar] hi");
  });
});

describe("daily limits", () => {
  it("stops at the limit", async () => {
    process.env.ASSISTANT_DAILY_LIMIT_GUEST = "3";
    const key = `ip:${run}`;
    const results = [];
    for (let i = 0; i < 4; i++) results.push((await takeQuota(key, false)).ok);
    expect(results).toEqual([true, true, true, false]);
    expect(await quotaLeft(key, false)).toBe(0);
    expect(await quotaLeft(`ip:other-${run}`, false)).toBe(3);
    delete process.env.ASSISTANT_DAILY_LIMIT_GUEST;
  });
});
