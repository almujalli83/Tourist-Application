import { getDictionary } from "@/i18n";
import { fmt } from "@/i18n";
import type { Locale } from "@/i18n/config";
import { verifyCardToken } from "@/lib/card/card";
import { countryName } from "@/lib/data/countries";
import { fmtDay, fmtKsa } from "@/lib/events/format";

export const dynamic = "force-dynamic";

/** Public page opened by scanning a digital tourist card: the result and the minimum data. */
export default async function VerifyCardPage({ params }: { params: Promise<{ locale: Locale; token: string }> }) {
  const { locale, token } = await params;
  const t = getDictionary(locale);
  const v = t.card.verify;
  const r = await verifyCardToken(token);
  const ok = r.result === "valid";
  const tone = ok ? "bg-emerald-600" : r.result === "expiredCode" ? "bg-amber-500" : "bg-red-600";
  return (
    <div className="mx-auto max-w-md px-4 py-10">
      <h1 className="mb-4 text-center text-lg font-bold">{t.card.verifyTitle}</h1>
      <div className="overflow-hidden rounded-3xl bg-white shadow-lg ring-1 ring-slate-200" data-testid="card-verify">
        <div className={`${tone} p-6 text-center text-white`}>
          <p className="text-5xl" aria-hidden>{ok ? "✓" : r.result === "expiredCode" ? "⏱" : "✕"}</p>
          <p className="mt-2 text-2xl font-bold" data-testid="verify-result">{v[r.result]}</p>
        </div>
        {"card" in r ? (
          <div className="space-y-3 p-6 text-center">
            {r.photo && (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={`/api/card/photo/${token}`} alt="" className="mx-auto size-28 rounded-2xl object-cover ring-2 ring-slate-200" />
            )}
            <p className="text-2xl font-bold tracking-wide" dir="ltr">{r.card.nameEn}</p>
            <p className="text-slate-600">{countryName(r.card.nationality, locale)}</p>
            <p className="text-sm text-slate-600">{t.card.validUntil}: <b>{fmtDay(r.card.visaExpiryDate, locale, { day: "numeric", month: "long", year: "numeric" })}</b></p>
            {r.card.demo && <p className="text-xs font-semibold text-amber-700">{t.card.sample}</p>}
            <p className="text-xs text-slate-400">{fmt(v.checkedAt, { time: fmtKsa(r.checkedAt, locale, { dateStyle: "medium", timeStyle: "short" }) })}</p>
          </div>
        ) : (
          <p className="p-6 text-center text-sm text-slate-600">{r.result === "expiredCode" ? v.expiredHint : v.invalidHint}</p>
        )}
      </div>
      <p className="mt-4 text-center text-xs text-slate-400">{v.note}</p>
    </div>
  );
}
