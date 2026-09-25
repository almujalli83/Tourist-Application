import type { Metadata } from "next";
import { RestaurantsView } from "@/components/restaurants/restaurants-view";
import { getDictionary } from "@/i18n";
import { isLocale } from "@/i18n/config";

export async function generateMetadata({ params }: { params: Promise<{ locale: string }> }): Promise<Metadata> {
  const { locale } = await params;
  if (!isLocale(locale)) return {};
  const t = getDictionary(locale);
  return { title: t.restaurants.title, description: t.restaurants.subtitle };
}

export default function RestaurantsPage() {
  return (
    <div className="mx-auto max-w-7xl px-4 py-8 sm:px-6">
      <RestaurantsView />
    </div>
  );
}
