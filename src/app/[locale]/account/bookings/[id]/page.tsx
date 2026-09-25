import { redirect } from "next/navigation";
import { BookingDetails } from "@/components/booking-details";
import { currentUser } from "@/lib/auth/session";

export default async function BookingPage({ params, searchParams }: {
  params: Promise<{ locale: string; id: string }>;
  searchParams: Promise<{ updated?: string }>;
}) {
  const { locale, id } = await params;
  if (!(await currentUser())) redirect(`/${locale}/login`);
  const { updated } = await searchParams;
  return (
    <div className="mx-auto max-w-6xl px-4 py-8 sm:px-6">
      <BookingDetails id={id} updated={updated === "1"} />
    </div>
  );
}
