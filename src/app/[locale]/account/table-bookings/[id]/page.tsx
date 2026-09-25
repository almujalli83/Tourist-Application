import { redirect } from "next/navigation";
import { TableBookingView } from "@/components/restaurants/table-booking-view";
import { currentUser } from "@/lib/auth/session";

export default async function TableBookingPage({ params }: { params: Promise<{ locale: string; id: string }> }) {
  const { locale, id } = await params;
  if (!(await currentUser())) redirect(`/${locale}/login?next=/${locale}/account/table-bookings/${id}`);
  return (
    <div className="mx-auto max-w-7xl px-4 py-8 sm:px-6">
      <TableBookingView id={id} />
    </div>
  );
}
