import type { Metadata } from "next";
import { PlannerView } from "@/components/planner/planner-view";
import { getDictionary } from "@/i18n";
import { isLocale } from "@/i18n/config";

export async function generateMetadata({ params }: { params: Promise<{ locale: string }> }): Promise<Metadata> {
  const { locale } = await params;
  if (!isLocale(locale)) return {};
  const t = getDictionary(locale);
  return { title: t.planner.title, description: t.planner.subtitle };
}

/** Smart trip planner (open to everyone; approving and booking a plan requires signing in). */
export default function PlannerPage() {
  return (
    <div className="mx-auto max-w-7xl px-4 py-8 sm:px-6">
      <PlannerView />
    </div>
  );
}
