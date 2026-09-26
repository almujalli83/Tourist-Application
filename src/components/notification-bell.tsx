"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { fmt } from "@/i18n";
import { useApp } from "./app-provider";
import { BellIcon } from "./icons";
import { cx } from "./ui";

/** Fired by the notifications page after it marks them read or deletes one. */
export const NOTIFICATIONS_CHANGED = "notifications:changed";

/** Header bell with the number of unread notifications (signed-in travellers). */
export function NotificationBell({ className }: { className?: string }) {
  const { locale, t } = useApp();
  const pathname = usePathname();
  const [unread, setUnread] = useState(0);

  useEffect(() => {
    let alive = true;
    const load = () =>
      fetch("/api/notifications")
        .then((r) => (r.ok ? r.json() : null))
        .then((d) => alive && d && setUnread(d.unread))
        .catch(() => undefined);
    load();
    window.addEventListener(NOTIFICATIONS_CHANGED, load);
    return () => {
      alive = false;
      window.removeEventListener(NOTIFICATIONS_CHANGED, load);
    };
  }, [pathname]);

  const href = `/${locale}/account/notifications`;
  return (
    <Link
      href={href}
      data-testid="notification-bell"
      aria-label={fmt(t.account.notifications.bell, { n: unread })}
      title={t.account.notifications.nav}
      className={cx("relative grid size-9 place-items-center rounded-md hover:bg-white/10", pathname.startsWith(href) && "bg-white/10 text-gold-100", className)}
    >
      <BellIcon className="size-5" />
      {unread > 0 && (
        <span data-testid="notification-count" className="absolute -end-0.5 -top-0.5 grid min-w-4 place-items-center rounded-full bg-red-500 px-1 text-[10px] font-bold leading-4 text-white">
          {unread > 9 ? "9+" : unread}
        </span>
      )}
    </Link>
  );
}
