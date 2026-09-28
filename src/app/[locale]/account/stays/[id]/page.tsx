import { redirect } from "next/navigation";
import { StayView } from "@/components/standalone/stay-view";
import { currentUser } from "@/lib/auth/session";

export default async function Page({ params }: { params: Promise<{ locale: string; id: string }> }) {
  const { locale, id } = await params;
  if (!(await currentUser())) redirect(`/${locale}/login?next=/${locale}/account/stays/${id}`);
  return (
    <div className="mx-auto max-w-7xl px-4 py-8 sm:px-6">
      <StayView id={id} />
    </div>
  );
}
