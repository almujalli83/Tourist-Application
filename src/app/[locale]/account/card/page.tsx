import { redirect } from "next/navigation";
import { CardView } from "@/components/card/card-view";
import { currentUser } from "@/lib/auth/session";

export default async function CardPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  if (!(await currentUser())) redirect(`/${locale}/login?next=/${locale}/account/card`);
  return (
    <div className="mx-auto max-w-7xl px-4 py-8 sm:px-6">
      <CardView />
    </div>
  );
}
