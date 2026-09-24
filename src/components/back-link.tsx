"use client";

import Link from "next/link";
import { useApp } from "./app-provider";
import { ChevronIcon } from "./icons";
import { cx } from "./ui";

/** Back navigation shown at the top of every page (arrow points left in English, right in Arabic). */
export function BackLink({ href, label, className, tone = "dark" }: { href: string; label?: string; className?: string; tone?: "dark" | "light" }) {
  const { t } = useApp();
  return (
    <Link
      href={href}
      className={cx(
        "inline-flex h-9 items-center gap-1.5 rounded-lg px-2.5 text-sm font-semibold transition-colors",
        tone === "dark" ? "text-brand-800 hover:bg-brand-50" : "text-white hover:bg-white/10",
        className,
      )}
    >
      <ChevronIcon className="size-4 rotate-180 rtl:rotate-0" />
      {label ?? t.common.back}
    </Link>
  );
}
