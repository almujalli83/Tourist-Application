import { notFound, redirect } from "next/navigation";
import { AdminSupport } from "@/components/support/admin-support";
import { currentUser } from "@/lib/auth/session";

export default async function AdminSupportPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  const user = await currentUser();
  if (!user) redirect(`/${locale}/login?next=/${locale}/admin/support`);
  if (!user.isAdmin) notFound();
  return (
    <div className="mx-auto max-w-7xl px-4 py-8 sm:px-6">
      <AdminSupport />
    </div>
  );
}
