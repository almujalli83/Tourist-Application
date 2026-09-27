import { currentUser } from "@/lib/auth/session";
import { body, error, handle, json } from "@/lib/http";
import { getAlertPrefs, setAlertPrefs } from "@/lib/alerts/alerts";

/** The traveller's optional alerts: { eventSuggestions, dailyProgramme }. */
export const GET = handle(async () => {
  const user = await currentUser();
  if (!user) return error("unauthorized", 401);
  return json({ prefs: await getAlertPrefs(user.id) });
});

export const PUT = handle(async (req: Request) => {
  const user = await currentUser();
  if (!user) return error("unauthorized", 401);
  const b = await body<{ eventSuggestions?: unknown; dailyProgramme?: unknown }>(req);
  if (!b) return error("invalidBody", 400);
  return json({ prefs: await setAlertPrefs(user.id, b as { eventSuggestions?: boolean; dailyProgramme?: boolean }) });
});
