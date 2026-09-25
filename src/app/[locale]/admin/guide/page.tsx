import { notFound, redirect } from "next/navigation";
import { AdminGuide } from "@/components/guide/admin-guide";
import { currentUser } from "@/lib/auth/session";

export default async function AdminGuidePage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  const user = await currentUser();
  if (!user) redirect(`/${locale}/login?next=/${locale}/admin/guide`);
  if (!user.isAdmin) notFound();
  return (
    <div className="mx-auto max-w-7xl px-4 py-8 sm:px-6">
      <AdminGuide />
    </div>
  );
}
