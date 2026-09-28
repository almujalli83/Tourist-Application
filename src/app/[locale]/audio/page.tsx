import type { Metadata } from "next";
import { AudioTours } from "@/components/audio/audio-tours";
import { isLocale } from "@/i18n/config";
import { pageDictionary } from "@/i18n/server";

export async function generateMetadata({ params }: { params: Promise<{ locale: string }> }): Promise<Metadata> {
  const { locale } = await params;
  if (!isLocale(locale)) return {};
  const t = await pageDictionary(locale);
  return { title: t.audio.title, description: t.audio.subtitle };
}

export default function AudioPage() {
  return (
    <div className="mx-auto max-w-7xl px-4 py-8 sm:px-6">
      <AudioTours />
    </div>
  );
}
