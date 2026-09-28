import type { Metadata } from "next";
import { PrivacyPolicy } from "@/components/privacy-policy";
import { isLocale } from "@/i18n/config";
import { pageDictionary } from "@/i18n/server";
import { PRIVACY_VERSION } from "@/lib/compliance/consent";
import { residencyMode } from "@/lib/compliance/residency";
import { retentionRules } from "@/lib/compliance/retention";

export const dynamic = "force-dynamic";

export async function generateMetadata({ params }: { params: Promise<{ locale: string }> }): Promise<Metadata> {
  const { locale } = await params;
  return isLocale(locale) ? { title: (await pageDictionary(locale)).privacy.title } : {};
}

export default function PrivacyPage() {
  return (
    <PrivacyPolicy facts={{
      version: PRIVACY_VERSION,
      residency: residencyMode(),
      contact: process.env.PRIVACY_CONTACT_EMAIL?.trim() || null,
      retention: retentionRules().map((r) => ({ key: r.key, days: r.days })),
    }} />
  );
}
