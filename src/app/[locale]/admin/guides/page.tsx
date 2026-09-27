import { notFound, redirect } from "next/navigation";
import { AdminGuides } from "@/components/guides/admin-guides";
import { currentUser } from "@/lib/auth/session";

export default async function AdminGuidesPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  const user = await currentUser();
  if (!user) redirect(`/${locale}/login?next=/${locale}/admin/guides`);
  if (!user.isAdmin) notFound();
  return (
    <div className="mx-auto max-w-7xl px-4 py-8 sm:px-6">
      <AdminGuides />
    </div>
  );
}
