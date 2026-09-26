"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useApp } from "../app-provider";
import { PhoneIcon } from "../icons";

/** Always-visible emergency button (opposite corner to the assistant). */
export function SosButton() {
  const { t, locale } = useApp();
  const pathname = usePathname();
  if (pathname.startsWith(`/${locale}/emergency`)) return null;
  return (
    <Link
      href={`/${locale}/emergency`}
      aria-label={t.emergency.title}
      title={t.emergency.title}
      data-testid="sos"
      className="fixed bottom-5 start-5 z-[650] flex h-14 items-center gap-1.5 rounded-full bg-red-600 px-4 text-sm font-bold text-white shadow-xl ring-4 ring-white transition hover:bg-red-700"
    >
      <PhoneIcon className="size-5" />
      {t.emergency.sos}
    </Link>
  );
}
