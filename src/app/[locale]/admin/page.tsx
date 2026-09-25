import { notFound, redirect } from "next/navigation";
import { AdminOperations } from "@/components/admin-operations";
import { currentUser } from "@/lib/auth/session";

export default async function AdminPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  const user = await currentUser();
  if (!user) redirect(`/${locale}/login?next=/${locale}/admin`);
  if (!user.isAdmin) notFound();
  return (
    <div className="mx-auto max-w-7xl px-4 py-8 sm:px-6">
      <AdminOperations />
    </div>
  );
}
