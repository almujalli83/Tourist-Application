import type { Metadata } from "next";
import { AccessibilityStatement } from "@/components/accessibility-statement";
import { getDictionary } from "@/i18n";
import { isLocale } from "@/i18n/config";

export async function generateMetadata({ params }: { params: Promise<{ locale: string }> }): Promise<Metadata> {
  const { locale } = await params;
  return isLocale(locale) ? { title: getDictionary(locale).a11y.statementTitle } : {};
}

export default function AccessibilityPage() {
  return <AccessibilityStatement />;
}
