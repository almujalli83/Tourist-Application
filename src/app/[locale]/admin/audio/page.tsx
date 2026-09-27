import { notFound, redirect } from "next/navigation";
import { AdminAudio } from "@/components/audio/admin-audio";
import { currentUser } from "@/lib/auth/session";

export default async function AdminAudioPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  const user = await currentUser();
  if (!user) redirect(`/${locale}/login?next=/${locale}/admin/audio`);
  if (!user.isAdmin) notFound();
  return (
    <div className="mx-auto max-w-7xl px-4 py-8 sm:px-6">
      <AdminAudio />
    </div>
  );
}
