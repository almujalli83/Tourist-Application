/**
 * Driving-licence requirements for visitors, by the country that issued the licence. Kept in the
 * store and edited by the operations team (rules change); the first rule whose countries include
 * the licence country applies, else the general rule ("*"). The initial rules follow published
 * guidance and are marked unreviewed until the team confirms them with the official sources.
 */
import { store } from "../store";

export interface LicenceRule {
  id: string;
  /** ISO alpha-2 codes, or ["*"] for everyone else. */
  countries: string[];
  titleAr: string;
  titleEn: string;
  requirementsAr: string[];
  requirementsEn: string[];
}

export interface LicenceRules {
  rules: LicenceRule[];
  /** When and by whom the rules were last confirmed (null = not reviewed yet). */
  reviewedAt: string | null;
  reviewedBy: string | null;
  sourceUrl: string;
}

const DOC = "rentalLicenceRules";
export const GCC = ["SA", "AE", "BH", "KW", "OM", "QA"];

export const DEFAULT_LICENCE_RULES: LicenceRules = {
  reviewedAt: null,
  reviewedBy: null,
  sourceUrl: "https://www.absher.sa",
  rules: [
    {
      id: "gcc", countries: GCC,
      titleAr: "رخصة قيادة خليجية", titleEn: "GCC driving licence",
      requirementsAr: ["رخصة القيادة الصادرة من إحدى دول مجلس التعاون سارية المفعول.", "جواز السفر أو الهوية الوطنية عند الاستلام."],
      requirementsEn: ["A valid driving licence issued by a GCC country.", "Your passport or national ID at pickup."],
    },
    {
      id: "general", countries: ["*"],
      titleAr: "رخصة قيادة من بلدك", titleEn: "Licence from your country",
      requirementsAr: [
        "رخصة قيادة سارية من بلدك مطابقة لفئة السيارة.",
        "رخصة القيادة الدولية، أو ترجمة عربية معتمدة لرخصتك.",
        "يُسمح للزائر بالقيادة بها حتى سنة من تاريخ الدخول أو حتى انتهاء الرخصة، أيهما أقرب.",
        "جواز السفر والتأشيرة عند الاستلام.",
      ],
      requirementsEn: [
        "A valid licence from your country for the vehicle category.",
        "An International Driving Permit, or an accredited Arabic translation of your licence.",
        "Visitors may drive with it for up to one year from entry or until the licence expires, whichever comes first.",
        "Your passport and visa at pickup.",
      ],
    },
  ],
};

export async function getLicenceRules(): Promise<LicenceRules> {
  const kept = await store().get<LicenceRules & { id: string }>("config", DOC);
  if (!kept) return DEFAULT_LICENCE_RULES;
  const { id: _id, ...rules } = kept; // eslint-disable-line @typescript-eslint/no-unused-vars
  return rules;
}

/** The rule for a licence issued in `country`. */
export function ruleFor(rules: LicenceRules, country: string): LicenceRule | null {
  const c = country.toUpperCase();
  return rules.rules.find((r) => r.countries.includes(c)) ?? rules.rules.find((r) => r.countries.includes("*")) ?? null;
}

const lines = (v: unknown) => (Array.isArray(v) ? v : []).map((x) => String(x).trim().slice(0, 300)).filter(Boolean).slice(0, 12);

/** Saves the rules edited by operations; `reviewed` confirms them with the official sources. */
export async function setLicenceRules(input: { rules?: unknown; sourceUrl?: unknown; reviewed?: unknown }, by: string, now = new Date()): Promise<LicenceRules> {
  const raw = Array.isArray(input.rules) ? (input.rules as Record<string, unknown>[]) : [];
  const rules: LicenceRule[] = raw.slice(0, 20).map((r, i) => ({
    id: String(r.id ?? `rule-${i + 1}`).replace(/[^\w-]/g, "").slice(0, 40) || `rule-${i + 1}`,
    countries: (Array.isArray(r.countries) ? r.countries : String(r.countries ?? "").split(","))
      .map((c) => String(c).trim().toUpperCase()).filter((c) => c === "*" || /^[A-Z]{2}$/.test(c)),
    titleAr: String(r.titleAr ?? "").trim().slice(0, 120),
    titleEn: String(r.titleEn ?? "").trim().slice(0, 120),
    requirementsAr: lines(r.requirementsAr),
    requirementsEn: lines(r.requirementsEn),
  }));
  if (!rules.length || rules.some((r) => !r.countries.length || !r.titleAr || !r.titleEn || !r.requirementsAr.length || !r.requirementsEn.length)) throw new Error("invalidRules");
  if (!rules.some((r) => r.countries.includes("*"))) throw new Error("noGeneralRule");
  const url = String(input.sourceUrl ?? "").trim();
  const doc: LicenceRules = {
    rules,
    sourceUrl: /^https:\/\/\S+$/.test(url) ? url.slice(0, 300) : DEFAULT_LICENCE_RULES.sourceUrl,
    reviewedAt: input.reviewed === true ? now.toISOString() : null,
    reviewedBy: input.reviewed === true ? by : null,
  };
  await store().put("config", DOC, { id: DOC, ...doc });
  return doc;
}
