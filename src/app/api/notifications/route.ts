import { currentUser } from "@/lib/auth/session";
import { error, handle, json } from "@/lib/http";
import { seedDemoNotifications } from "@/lib/reminders/demo";
import { listNotifications, markRead } from "@/lib/reminders/reminders";

/** The account's notifications (trip and visa reminders), newest first. */
export const GET = handle(async () => {
  const user = await currentUser();
  if (!user) return error("unauthorized", 401);
  await seedDemoNotifications(user.id);
  const notifications = await listNotifications(user.id);
  return json({ notifications, unread: notifications.filter((n) => !n.readAt).length });
});

/** Marks all notifications as read. */
export const POST = handle(async () => {
  const user = await currentUser();
  if (!user) return error("unauthorized", 401);
  await markRead(user.id);
  return json({ ok: true });
});
