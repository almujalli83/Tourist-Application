import { redirect } from "next/navigation";
import { AccountView } from "@/components/account-view";
import { currentUser } from "@/lib/auth/session";
import { listBookings } from "@/lib/bookings/service";

export default async function AccountPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  const user = await currentUser();
  if (!user) redirect(`/${locale}/login?next=/${locale}/account`);
  const bookings = await listBookings(user.id);
  return (
    <AccountView
      bookings={bookings.map((b) => ({
        id: b.id,
        reference: b.reference,
        clientReference: b.clientReference,
        createdAt: b.createdAt,
        origin: b.criteria.origin,
        cities: b.criteria.stays.map((s) => s.city),
        departureDate: b.criteria.departureDate,
        returnDate: b.criteria.returnDate,
        travellers: b.applicants.length,
        leadName: b.applicants[0]?.nameEn ?? "",
        visasIssued: b.applicants.filter((a) => a.visaNumber).length,
        totalSAR: b.price.totalSAR,
        status: b.mt.packageStatus ?? b.status,
      }))}
    />
  );
}
