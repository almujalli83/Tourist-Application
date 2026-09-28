import type { Metadata } from "next";
import { EsimView } from "@/components/esim/esim-view";
import { isLocale } from "@/i18n/config";
import { pageDictionary } from "@/i18n/server";

export async function generateMetadata({ params }: { params: Promise<{ locale: string }> }): Promise<Metadata> {
  const { locale } = await params;
  if (!isLocale(locale)) return {};
  const t = await pageDictionary(locale);
  return { title: t.esim.title, description: t.esim.subtitle };
}

export default function EsimPage() {
  return (
    <div className="mx-auto max-w-7xl px-4 py-8 sm:px-6">
      <EsimView />
    </div>
  );
}
