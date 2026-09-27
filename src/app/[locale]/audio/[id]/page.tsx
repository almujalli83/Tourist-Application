import type { Metadata } from "next";
import { TourPlayer } from "@/components/audio/tour-player";
import { getDictionary } from "@/i18n";
import { isLocale } from "@/i18n/config";
import { getTour } from "@/lib/audio/tours";

export async function generateMetadata({ params }: { params: Promise<{ locale: string; id: string }> }): Promise<Metadata> {
  const { locale, id } = await params;
  if (!isLocale(locale)) return {};
  const t = getDictionary(locale);
  const tour = await getTour(id).catch(() => null);
  if (!tour || tour.status !== "published") return { title: t.audio.title };
  return { title: `${locale === "ar" ? tour.titleAr : tour.titleEn} — ${t.audio.title}`, description: locale === "ar" ? tour.summaryAr : tour.summaryEn };
}

export default async function AudioTourPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return (
    <div className="mx-auto max-w-7xl px-4 py-8 sm:px-6">
      <TourPlayer id={id} />
    </div>
  );
}
