import { describe, expect, it, vi } from "vitest";

const cookie = { value: "zh" };
vi.mock("next/headers", () => ({ cookies: async () => ({ get: () => cookie }) }));
import { UI_LANGS, uiDir, uiLangFor } from "@/i18n/config";
import { applyPack, getDictionary, PACKS } from "@/i18n";
import en from "@/i18n/en";
import { pageDictionary } from "@/i18n/server";

/** Flat "a.b.0.c" → text of every string in the English dictionary. */
function flatten(node: unknown, prefix = "", out: Record<string, string> = {}): Record<string, string> {
  if (typeof node === "string") out[prefix] = node;
  else if (node && typeof node === "object") for (const [k, v] of Object.entries(node)) flatten(v, prefix ? `${prefix}.${k}` : k, out);
  return out;
}

const english = flatten(en);
const placeholders = (s: string) => [...s.matchAll(/\{(\w+)\}/g)].map((m) => m[1]).sort();

describe("interface language packs", () => {
  for (const [lang, pack] of Object.entries(PACKS)) {
    it(`${lang}: every key exists in English with the same placeholders`, () => {
      const keys = Object.keys(pack);
      expect(keys.length).toBeGreaterThan(2500);
      for (const key of keys) {
        expect(english[key], `${lang} ${key}`).toBeTypeOf("string");
        expect(placeholders(pack[key]), `${lang} ${key}`).toEqual(placeholders(english[key]));
      }
    });
  }

  it("applyPack only replaces existing text keys and keeps the rest in English", () => {
    const d = applyPack(en, { "nav.home": "Accueil", "nav.nope": "x", "nav.home.deep": "x", "meta": "x" });
    expect(d.nav.home).toBe("Accueil");
    expect((d.nav as Record<string, unknown>).nope).toBeUndefined();
    expect(d.meta).toEqual(en.meta);
    expect(d.nav.login).toBe(en.nav.login);
    expect(en.nav.home).not.toBe("Accueil");
  });

  it("getDictionary merges a pack only over the English pages", () => {
    expect(getDictionary("en", "fr").nav.home).toBe(PACKS.fr["nav.home"]);
    expect(getDictionary("ar", "fr")).toBe(getDictionary("ar"));
    expect(getDictionary("en", "en")).toBe(en);
  });

  it("chooses the interface language and direction", () => {
    expect(UI_LANGS).toContain("zh");
    expect(uiLangFor("en", "ur")).toBe("ur");
    expect(uiLangFor("ar", "ur")).toBe("ar");
    expect(uiLangFor("en", "xx")).toBe("en");
    expect(uiDir("ur")).toBe("rtl");
    expect(uiDir("zh")).toBe("ltr");
  });

  it("server pages read the interface language from the cookie", async () => {
    expect((await pageDictionary("en")).nav.home).toBe(PACKS.zh["nav.home"]);
    expect((await pageDictionary("ar")).nav.home).toBe(getDictionary("ar").nav.home);
    cookie.value = "nope";
    expect((await pageDictionary("en")).nav.home).toBe(en.nav.home);
  });
});
