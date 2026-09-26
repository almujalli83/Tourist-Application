import { notFound, redirect } from "next/navigation";
import { AdminReviews } from "@/components/reviews/admin-reviews";
import { currentUser } from "@/lib/auth/session";

export default async function AdminReviewsPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  const user = await currentUser();
  if (!user) redirect(`/${locale}/login?next=/${locale}/admin/reviews`);
  if (!user.isAdmin) notFound();
  return (
    <div className="mx-auto max-w-7xl px-4 py-8 sm:px-6">
      <AdminReviews />
    </div>
  );
}
