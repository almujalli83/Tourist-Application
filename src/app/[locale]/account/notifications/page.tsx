import { redirect } from "next/navigation";
import { NotificationsView } from "@/components/notifications-view";
import { currentUser } from "@/lib/auth/session";

export default async function NotificationsPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  if (!(await currentUser())) redirect(`/${locale}/login?next=/${locale}/account/notifications`);
  return (
    <div className="mx-auto max-w-7xl px-4 py-8 sm:px-6">
      <NotificationsView />
    </div>
  );
}
