import { redirect } from "next/navigation";
import { SecurityView } from "@/components/security-view";
import { currentUser } from "@/lib/auth/session";

export default async function SecurityPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  if (!(await currentUser())) redirect(`/${locale}/login?next=/${locale}/account/security`);
  return <SecurityView />;
}
