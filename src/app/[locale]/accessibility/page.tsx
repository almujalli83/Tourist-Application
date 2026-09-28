import type { Metadata } from "next";
import { AccessibilityStatement } from "@/components/accessibility-statement";
import { isLocale } from "@/i18n/config";
import { pageDictionary } from "@/i18n/server";

export async function generateMetadata({ params }: { params: Promise<{ locale: string }> }): Promise<Metadata> {
  const { locale } = await params;
  return isLocale(locale) ? { title: (await pageDictionary(locale)).a11y.statementTitle } : {};
}

export default function AccessibilityPage() {
  return <AccessibilityStatement />;
}
