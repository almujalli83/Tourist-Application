import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import { IndicatorsView } from "@/components/indicators-view";
import { currentUser } from "@/lib/auth/session";

export const metadata: Metadata = { robots: { index: false } };

export default async function IndicatorsPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  const user = await currentUser();
  if (!user) redirect(`/${locale}/login?next=/${locale}/indicators`);
  if (!user.isAdmin && !user.isMinistry) notFound();
  return <IndicatorsView />;
}
