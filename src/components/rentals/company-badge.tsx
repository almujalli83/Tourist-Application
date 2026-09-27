"use client";

import type { CompanyBrand } from "@/lib/rentals/rentals";
import { useApp } from "../app-provider";
import { cx } from "../ui";

/** Dark text on light brand colours (e.g. yellow), white otherwise. */
const light = (hex: string) => {
  const n = parseInt(hex.slice(1), 16);
  return (0.299 * (n >> 16) + 0.587 * ((n >> 8) & 255) + 0.114 * (n & 255)) / 255 > 0.62;
};

/** A rental company: its logo when uploaded, else its name on its brand colour. */
export function CompanyBadge({ brand, fallback, size = "md", className }: { brand: CompanyBrand | null | undefined; fallback?: string; size?: "sm" | "md"; className?: string }) {
  const { locale } = useApp();
  const name = brand ? (locale === "ar" ? brand.nameAr : brand.nameEn) : (fallback ?? "");
  if (brand?.logo) {
    // eslint-disable-next-line @next/next/no-img-element
    return <img src={brand.logo} alt={name} title={name} className={cx("w-auto max-w-28 object-contain", size === "sm" ? "h-5" : "h-7", className)} data-testid="company-logo" />;
  }
  const bg = brand?.color ?? "#334155";
  return (
    <span className={cx("inline-flex items-center rounded-md font-extrabold tracking-wide", size === "sm" ? "h-5 px-1.5 text-[11px]" : "h-7 px-2.5 text-sm", className)}
      style={{ background: bg, color: light(bg) ? "#111827" : "#fff" }} data-testid="company-badge">
      {name}
    </span>
  );
}
