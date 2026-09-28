import type { Metadata } from "next";
import { BusesView } from "@/components/buses/buses-view";
import { isLocale } from "@/i18n/config";
import { pageDictionary } from "@/i18n/server";

export async function generateMetadata({ params }: { params: Promise<{ locale: string }> }): Promise<Metadata> {
  const { locale } = await params;
  if (!isLocale(locale)) return {};
  const t = await pageDictionary(locale);
  return { title: t.buses.title, description: t.buses.subtitle };
}

export default function BusesPage() {
  return (
    <div className="mx-auto max-w-7xl px-4 py-8 sm:px-6">
      <BusesView />
    </div>
  );
}
