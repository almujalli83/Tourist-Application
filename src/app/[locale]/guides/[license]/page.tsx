import Link from "next/link";
import { GuideProfile } from "@/components/guides/guide-profile";
import type { Locale } from "@/i18n/config";
import { pageDictionary } from "@/i18n/server";
import { getGuide } from "@/lib/guides/guides";
import { guideQrSvg } from "@/lib/guides/qr";

export const dynamic = "force-dynamic";

export default async function GuidePage({ params }: { params: Promise<{ locale: Locale; license: string }> }) {
  const { locale, license: raw } = await params;
  const license = decodeURIComponent(raw);
  const g = await getGuide(license);
  if (!g) {
    // Unknown or no longer licensed: hidden; the licence check tells which.
    const t = await pageDictionary(locale);
    return (
      <div className="mx-auto max-w-md px-4 py-16 text-center" data-testid="guide-unavailable">
        <p className="text-lg font-bold">{t.guides.errors.guideUnavailable}</p>
        <p className="mt-4 flex justify-center gap-4 text-sm font-semibold text-brand-700">
          <Link href={`/${locale}/verify/guide/${encodeURIComponent(license)}`} className="underline">{t.guides.verifyBtn}</Link>
          <Link href={`/${locale}/guides`} className="underline">{t.guides.booking.another}</Link>
        </p>
      </div>
    );
  }
  return (
    <div className="mx-auto max-w-7xl px-4 py-8 sm:px-6">
      <GuideProfile g={g} qrSvg={await guideQrSvg(locale, g.licenseNo)} />
    </div>
  );
}
