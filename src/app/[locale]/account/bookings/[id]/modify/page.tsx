import { redirect } from "next/navigation";
import { ModifyPackage } from "@/components/modify-package";
import { currentUser } from "@/lib/auth/session";

export default async function ModifyPackagePage({ params }: { params: Promise<{ locale: string; id: string }> }) {
  const { locale, id } = await params;
  if (!(await currentUser())) redirect(`/${locale}/login?next=/${locale}/account/bookings/${id}/modify`);
  return (
    <div className="mx-auto max-w-5xl px-4 py-8 sm:px-6">
      <ModifyPackage id={id} />
    </div>
  );
}
