import Link from "next/link";
import { getDictionary } from "@/i18n";
import type { Locale } from "@/i18n/config";
import { cityName } from "@/lib/data/cities";
import { fmtDay } from "@/lib/events/format";
import { verifyLicense } from "@/lib/guides/guides";
import { GUIDE_LANGUAGES } from "@/lib/guides/types";

export const dynamic = "force-dynamic";

/** Public licence check of a tour guide (by number or the guide's QR). */
export default async function VerifyGuidePage({ params }: { params: Promise<{ locale: Locale; license: string }> }) {
  const { locale, license: raw } = await params;
  const license = decodeURIComponent(raw).slice(0, 40);
  const t = getDictionary(locale);
  const v = t.guides.verify;
  const r = await verifyLicense(license);
  const ok = r.result === "valid";
  const ar = locale === "ar";
  return (
    <div className="mx-auto max-w-md px-4 py-10">
      <h1 className="mb-4 text-center text-lg font-bold">{t.guides.verifyTitle}</h1>
      <div className="overflow-hidden rounded-3xl bg-white shadow-lg ring-1 ring-slate-200" data-testid="guide-verify">
        <div className={`${ok ? "bg-emerald-600" : "bg-red-600"} p-6 text-center text-white`}>
          <p className="text-5xl" aria-hidden>{ok ? "✓" : "✕"}</p>
          <p className="mt-2 text-2xl font-bold" data-testid="verify-result">{v[r.result]}</p>
          <p className="mt-1 text-sm opacity-90">{t.guides.license}: <span dir="ltr" className="ltr-nums">{license}</span></p>
        </div>
        {ok && r.guide ? (
          <div className="space-y-2 p-6 text-center">
            <p className="text-2xl font-bold">{ar ? r.guide.nameAr : r.guide.nameEn}</p>
            <p className="text-sm text-slate-500" dir="ltr">{ar ? r.guide.nameEn : r.guide.nameAr}</p>
            <p className="text-sm text-slate-600">{t.guides.licenseUntil.replace("{date}", fmtDay(r.guide.licenseExpiry, locale, { day: "numeric", month: "long", year: "numeric" }))}</p>
            <p className="text-sm text-slate-600">{r.guide.languages.map((l) => `${GUIDE_LANGUAGES[l.code]?.[ar ? 0 : 1] ?? l.code} (${t.guides.levels[l.level]})`).join(ar ? "، " : ", ")}</p>
            <p className="text-sm text-slate-600">{r.guide.cities.map((c) => cityName(c, locale)).join(ar ? "، " : ", ")}</p>
            {r.guide.demo && <p className="text-xs font-semibold text-amber-700">{t.guides.sample}</p>}
            <p className="pt-2"><Link href={`/${locale}/guides/${encodeURIComponent(license)}`} className="text-sm font-semibold text-brand-700 underline">{t.guides.profile}</Link></p>
          </div>
        ) : (
          <p className="p-6 text-center text-sm text-slate-600">{r.result === "expired" ? v.expiredHint : v.notFoundHint}</p>
        )}
      </div>
      <p className="mt-4 text-center text-xs text-slate-400">{v.note}</p>
    </div>
  );
}
