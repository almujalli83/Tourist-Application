import type { Metadata } from "next";
import { GuideView } from "@/components/guide/guide-view";
import { getDictionary } from "@/i18n";
import { isLocale } from "@/i18n/config";

export async function generateMetadata({ params }: { params: Promise<{ locale: string }> }): Promise<Metadata> {
  const { locale } = await params;
  if (!isLocale(locale)) return {};
  const t = getDictionary(locale);
  return { title: t.guide.title, description: t.guide.subtitle };
}

/** Interactive map & guide (public; favourites are kept in the account when signed in). */
export default function GuidePage() {
  return <GuideView />;
}
