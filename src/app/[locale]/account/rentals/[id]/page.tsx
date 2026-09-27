import { redirect } from "next/navigation";
import { RentalView } from "@/components/rentals/rental-view";
import { currentUser } from "@/lib/auth/session";

export default async function RentalPage({ params }: { params: Promise<{ locale: string; id: string }> }) {
  const { locale, id } = await params;
  if (!(await currentUser())) redirect(`/${locale}/login?next=/${locale}/account/rentals/${id}`);
  return (
    <div className="mx-auto max-w-7xl px-4 py-8 sm:px-6">
      <RentalView id={id} />
    </div>
  );
}
