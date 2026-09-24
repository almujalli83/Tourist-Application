import { redirect } from "next/navigation";
import { SavedTravellersManager } from "@/components/saved-travellers-manager";
import { currentUser } from "@/lib/auth/session";

export default async function SavedTravellersPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  if (!(await currentUser())) redirect(`/${locale}/login?next=/${locale}/account/travellers`);
  return <SavedTravellersManager />;
}
