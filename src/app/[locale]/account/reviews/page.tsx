import { redirect } from "next/navigation";
import { MyReviews } from "@/components/reviews/my-reviews";
import { currentUser } from "@/lib/auth/session";

export default async function MyReviewsPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  if (!(await currentUser())) redirect(`/${locale}/login?next=/${locale}/account/reviews`);
  return (
    <div className="mx-auto max-w-7xl px-4 py-8 sm:px-6">
      <MyReviews />
    </div>
  );
}
