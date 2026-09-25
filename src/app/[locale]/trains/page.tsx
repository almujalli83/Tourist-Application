import type { Metadata } from "next";
import { TrainsView } from "@/components/transport/trains-view";
import { getDictionary } from "@/i18n";
import { isLocale } from "@/i18n/config";

export async function generateMetadata({ params }: { params: Promise<{ locale: string }> }): Promise<Metadata> {
  const { locale } = await params;
  if (!isLocale(locale)) return {};
  const t = getDictionary(locale);
  return { title: t.trains.title, description: t.trains.subtitle };
}

/** Train tickets (search open to everyone; booking requires signing in). */
export default function TrainsPage() {
  return (
    <div className="mx-auto max-w-7xl px-4 py-8 sm:px-6">
      <TrainsView />
    </div>
  );
}
