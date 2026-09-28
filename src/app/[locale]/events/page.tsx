import type { Metadata } from "next";
import { EventsView } from "@/components/events/events-view";
import { isLocale } from "@/i18n/config";
import { pageDictionary } from "@/i18n/server";

export async function generateMetadata({ params }: { params: Promise<{ locale: string }> }): Promise<Metadata> {
  const { locale } = await params;
  if (!isLocale(locale)) return {};
  const t = await pageDictionary(locale);
  return { title: t.events.title, description: t.events.subtitle };
}

/** Experiences & events (open to everyone; buying requires signing in). */
export default function EventsPage() {
  return (
    <div className="mx-auto max-w-7xl px-4 py-8 sm:px-6">
      <EventsView />
    </div>
  );
}
