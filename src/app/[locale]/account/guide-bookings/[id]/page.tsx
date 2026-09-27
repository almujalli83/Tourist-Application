import { redirect } from "next/navigation";
import { GuideBookingView } from "@/components/guides/guide-booking-view";
import { currentUser } from "@/lib/auth/session";

export default async function GuideBookingPage({ params }: { params: Promise<{ locale: string; id: string }> }) {
  const { locale, id } = await params;
  if (!(await currentUser())) redirect(`/${locale}/login?next=/${locale}/account/guide-bookings/${id}`);
  return (
    <div className="mx-auto max-w-7xl px-4 py-8 sm:px-6">
      <GuideBookingView id={id} />
    </div>
  );
}
