import type { Metadata } from "next";
import { TransportView } from "@/components/transport/transport-view";
import { getDictionary } from "@/i18n";
import { isLocale } from "@/i18n/config";

export async function generateMetadata({ params }: { params: Promise<{ locale: string }> }): Promise<Metadata> {
  const { locale } = await params;
  if (!isLocale(locale)) return {};
  const t = getDictionary(locale);
  return { title: t.transport.title, description: t.transport.subtitle };
}

export default function TransportPage() {
  return (
    <div className="mx-auto max-w-7xl px-4 py-8 sm:px-6">
      <TransportView />
    </div>
  );
}
