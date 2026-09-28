import { currentUser } from "@/lib/auth/session";
import { getEvisaApplication } from "@/lib/evisa/service";
import { error, handle, json } from "@/lib/http";

type Ctx = { params: Promise<{ id: string }> };

/** The application, with pending decisions refreshed from the eVisa channel. */
export const GET = handle(async (_req: Request, ctx: Ctx) => {
  const user = await currentUser();
  if (!user) return error("unauthorized", 401);
  const app = await getEvisaApplication(user, (await ctx.params).id);
  return app ? json({ application: app }) : error("notFound", 404);
});
