import { redirect } from "next/navigation";
import { BookingDetails } from "@/components/booking-details";
import { ResetBookingOnMount } from "@/components/booking/booking-context";
import { currentUser } from "@/lib/auth/session";

export default async function ConfirmationPage({ params }: { params: Promise<{ locale: string; id: string }> }) {
  const { locale, id } = await params;
  if (!(await currentUser())) redirect(`/${locale}/login`);
  return (
    <div className="mx-auto max-w-6xl px-4 py-8 sm:px-6">
      <ResetBookingOnMount />
      <BookingDetails id={id} fresh />
    </div>
  );
}
