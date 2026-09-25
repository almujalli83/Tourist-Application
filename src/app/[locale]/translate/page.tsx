import type { Metadata } from "next";
import { TranslateView } from "@/components/assistant/translate-view";
import { getDictionary } from "@/i18n";
import { isLocale } from "@/i18n/config";

export async function generateMetadata({ params }: { params: Promise<{ locale: string }> }): Promise<Metadata> {
  const { locale } = await params;
  if (!isLocale(locale)) return {};
  const t = getDictionary(locale);
  return { title: t.translate.title, description: t.translate.subtitle };
}

export default function TranslatePage() {
  return (
    <div className="mx-auto max-w-4xl px-4 py-8 sm:px-6">
      <TranslateView />
    </div>
  );
}
