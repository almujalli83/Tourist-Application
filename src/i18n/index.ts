import ar, { type Dictionary } from "./ar";
import { type Locale, type UiLang } from "./config";
import en from "./en";
import fr from "./packs/fr.json";
import id from "./packs/id.json";
import tr from "./packs/tr.json";
import ur from "./packs/ur.json";
import zh from "./packs/zh.json";

const dictionaries: Record<Locale, Dictionary> = { ar, en };

/** Translations of the interface into other languages: flat "section.key" → text (missing keys stay in English). */
type Pack = Record<string, string>;
export const PACKS: Record<Exclude<UiLang, Locale>, Pack> = { fr, tr, ur, id, zh };

/** Puts flat "a.b.0.c" keys into a copy of the English dictionary. */
export function applyPack(base: Dictionary, pack: Pack): Dictionary {
  const out = structuredClone(base) as unknown as Record<string, unknown>;
  for (const [path, value] of Object.entries(pack)) {
    const keys = path.split(".");
    let node = out as Record<string, unknown>;
    let ok = true;
    for (const k of keys.slice(0, -1)) {
      if (node[k] === null || typeof node[k] !== "object") {
        ok = false;
        break;
      }
      node = node[k] as Record<string, unknown>;
    }
    const last = keys[keys.length - 1];
    // Only keys that exist in English, with a text value (the pack can't change the shape).
    if (ok && typeof node[last] === "string" && typeof value === "string") node[last] = value;
  }
  return out as unknown as Dictionary;
}

const merged = new Map<UiLang, Dictionary>();

export function getDictionary(locale: Locale, ui?: UiLang): Dictionary {
  if (!ui || ui === locale || ui === "ar" || ui === "en") return dictionaries[locale];
  if (locale !== "en") return dictionaries[locale];
  let d = merged.get(ui);
  if (!d) {
    d = applyPack(en, PACKS[ui]);
    merged.set(ui, d);
  }
  return d;
}

/** Replaces `{name}` placeholders. */
export function fmt(template: string, vars: Record<string, string | number>): string {
  return template.replace(/\{(\w+)\}/g, (_, k) => String(vars[k] ?? `{${k}}`));
}

export type { Dictionary };
