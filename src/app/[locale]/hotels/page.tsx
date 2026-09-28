import type { Metadata } from "next";
import { HotelsView } from "@/components/standalone/hotels-view";
import { isLocale } from "@/i18n/config";
import { pageDictionary } from "@/i18n/server";

export async function generateMetadata({ params }: { params: Promise<{ locale: string }> }): Promise<Metadata> {
  const { locale } = await params;
  if (!isLocale(locale)) return {};
  const t = await pageDictionary(locale);
  return { title: `${t.standalone.tabs.hotels} — ${t.standalone.title}`, description: t.standalone.intro };
}

export default function Page() {
  return (
    <div className="mx-auto max-w-7xl px-4 py-8 sm:px-6">
      <HotelsView />
    </div>
  );
}
