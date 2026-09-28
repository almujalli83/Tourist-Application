import { RespondView } from "@/components/guides/respond-view";
import type { Locale } from "@/i18n/config";
import { pageDictionary } from "@/i18n/server";
import { requestByToken } from "@/lib/guides/bookings";

export const dynamic = "force-dynamic";

export default async function GuideRespondPage({ params }: { params: Promise<{ locale: Locale; token: string }> }) {
  const { locale, token } = await params;
  const booking = await requestByToken(token);
  return (
    <div className="mx-auto max-w-7xl px-4 py-8 sm:px-6">
      {booking ? <RespondView token={token} booking={booking} /> : <p className="py-16 text-center font-semibold">{(await pageDictionary(locale)).guides.respond.invalid}</p>}
    </div>
  );
}
