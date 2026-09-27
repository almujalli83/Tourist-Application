"use client";

import Link from "next/link";
import { cityName } from "@/lib/data/cities";
import type { ReviewSummary } from "@/lib/reviews/types";
import { GUIDE_LANGUAGES, type GuideLanguage, type PublicGuide } from "@/lib/guides/types";
import { useApp } from "../app-provider";
import { RatingBadge } from "../reviews/shared";
import { ChatIcon, PhoneIcon, ShieldIcon } from "../icons";
import { Badge, Card, cx } from "../ui";

export const langLabel = (code: string, locale: "ar" | "en") => GUIDE_LANGUAGES[code]?.[locale === "ar" ? 0 : 1] ?? code.toUpperCase();
const waNumber = (phone: string) => phone.replace(/\D/g, "").replace(/^0+/, "").replace(/^5/, "9665");

export function GuideAvatar({ g, className }: { g: Pick<PublicGuide, "nameAr" | "nameEn" | "gender">; className?: string }) {
  const { locale } = useApp();
  const name = locale === "ar" ? g.nameAr : g.nameEn;
  const initials = name.split(/\s+/).slice(0, 2).map((w) => w[0]).join("");
  return (
    <span className={cx("grid shrink-0 place-items-center rounded-full font-bold", g.gender === "female" ? "bg-gold-50 text-gold-700" : "bg-brand-50 text-brand-800", className ?? "size-14 text-lg")} aria-hidden>
      {initials}
    </span>
  );
}

export function LanguageChips({ languages, highlight }: { languages: GuideLanguage[]; highlight?: string }) {
  const { t, locale } = useApp();
  return (
    <span className="flex flex-wrap gap-1.5">
      {languages.map((l) => (
        <span key={l.code} className={cx("rounded-full px-2.5 py-0.5 text-xs", l.code === highlight ? "bg-brand-800 text-white" : "bg-slate-100 text-slate-700")} data-testid="guide-lang">
          {langLabel(l.code, locale)} · <span className="font-semibold">{t.guides.levels[l.level]}</span>
        </span>
      ))}
    </span>
  );
}

/** Call and WhatsApp, shown directly. */
export function ContactButtons({ phone, small }: { phone: string; small?: boolean }) {
  const { t } = useApp();
  const h = small ? "h-9 px-3 text-xs" : "h-10 px-4 text-sm";
  return (
    <span className="flex flex-wrap gap-2">
      <a href={`tel:${phone}`} className={cx("inline-flex items-center gap-1.5 rounded-lg bg-brand-800 font-semibold text-white hover:bg-brand-900", h)} data-testid="guide-call">
        <PhoneIcon className="size-4" />{t.guides.call}
      </a>
      <a href={`https://wa.me/${waNumber(phone)}`} target="_blank" rel="noopener noreferrer" className={cx("inline-flex items-center gap-1.5 rounded-lg bg-[#1f9d55] font-semibold text-white hover:bg-[#188a49]", h)} data-testid="guide-whatsapp">
        <ChatIcon className="size-4" />{t.guides.whatsapp}
      </a>
    </span>
  );
}

export function GuideCard({ g, summary, highlightLang, compact }: { g: PublicGuide; summary?: ReviewSummary; highlightLang?: string; compact?: boolean }) {
  const { t, locale } = useApp();
  const ar = locale === "ar";
  const href = `/${locale}/guides/${encodeURIComponent(g.licenseNo)}`;
  return (
    <Card className="flex flex-col gap-3 p-4" data-testid="guide-card">
      <div className="flex items-start gap-3">
        <GuideAvatar g={g} />
        <div className="min-w-0 flex-1">
          <Link href={href} className="block truncate font-bold text-ink hover:text-brand-700" data-testid="guide-name">{ar ? g.nameAr : g.nameEn}</Link>
          <p className="mt-0.5 flex flex-wrap items-center gap-1.5 text-xs text-slate-500">
            <span className="inline-flex items-center gap-1 font-semibold text-emerald-700"><ShieldIcon className="size-3.5" />{t.guides.licenseValid}</span>
            <span className="ltr-nums" dir="ltr">{g.licenseNo}</span>
            {g.demo && <Badge tone="gold">{t.guides.sample}</Badge>}
          </p>
          <RatingBadge summary={summary} className="mt-1" />
        </div>
      </div>
      <LanguageChips languages={g.languages} highlight={highlightLang} />
      {!compact && (
        <p className="text-xs text-slate-600">
          {g.cities.map((c) => cityName(c, locale)).join(ar ? "، " : ", ")} · {g.tracks.map((x) => t.guides.trackNames[x]).join(ar ? "، " : ", ")}
        </p>
      )}
      <div className="mt-auto flex flex-wrap items-center justify-between gap-2">
        <ContactButtons phone={g.phone} small />
        <Link href={href} className="text-sm font-semibold text-brand-700 hover:underline">{t.guides.profile}</Link>
      </div>
    </Card>
  );
}
