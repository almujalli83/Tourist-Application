import { redirect } from "next/navigation";
import { FamilyView } from "@/components/family-view";
import { currentUser } from "@/lib/auth/session";

export default async function FamilyPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  if (!(await currentUser())) redirect(`/${locale}/login?next=/${locale}/account/family`);
  return <FamilyView />;
}
