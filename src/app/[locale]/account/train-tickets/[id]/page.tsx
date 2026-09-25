import { redirect } from "next/navigation";
import { TrainTicketView } from "@/components/transport/train-ticket-view";
import { currentUser } from "@/lib/auth/session";

export default async function TrainTicketPage({ params }: { params: Promise<{ locale: string; id: string }> }) {
  const { locale, id } = await params;
  if (!(await currentUser())) redirect(`/${locale}/login?next=/${locale}/account/train-tickets/${id}`);
  return (
    <div className="mx-auto max-w-7xl px-4 py-8 sm:px-6">
      <TrainTicketView id={id} />
    </div>
  );
}
