"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { fmt } from "@/i18n";
import { useApp } from "../app-provider";
import { GiftIcon } from "../icons";
import { cx } from "../ui";
import { useLoyalty } from "./use-loyalty";

/** Header balance next to the notifications bell (individual accounts). */
export function PointsChip({ className }: { className?: string }) {
  const { locale, t, user } = useApp();
  const pathname = usePathname();
  const data = useLoyalty(user?.accountType === "individual", [pathname]);
  if (!data?.summary.eligible) return null;
  const href = `/${locale}/account/loyalty`;
  const n = data.summary.available.toLocaleString("en");
  return (
    <Link
      href={href}
      data-testid="points-chip"
      title={t.loyalty.programName}
      aria-label={`${t.loyalty.programName}: ${fmt(t.loyalty.chip, { n })}`}
      className={cx("flex h-9 items-center gap-1.5 whitespace-nowrap rounded-md px-2 text-sm font-medium hover:bg-white/10", pathname.startsWith(href) && "bg-white/10 text-gold-100", className)}
    >
      <GiftIcon className="size-4 text-gold-100" />
      <span className="ltr-nums">{fmt(t.loyalty.chip, { n })}</span>
    </Link>
  );
}
