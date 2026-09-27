import { currentUser } from "@/lib/auth/session";
import { body, error, handle, json } from "@/lib/http";
import { seedTravellerSample } from "@/lib/support/demo";
import { createTicket, listMyTickets, SupportError, type NewTicketInput } from "@/lib/support/tickets";

export const maxDuration = 60;

/** The traveller's support tickets (newest first). */
export const GET = handle(async () => {
  const user = await currentUser();
  if (!user) return error("unauthorized", 401);
  await seedTravellerSample(user);
  return json({ tickets: await listMyTickets(user.id) });
});

/** Opens a ticket: { subject, category, message, lang, bookingId?, attachments? } */
export const POST = handle(async (req: Request) => {
  const user = await currentUser();
  if (!user) return error("unauthorized", 401);
  const b = await body<NewTicketInput>(req);
  if (!b) return error("invalidBody", 400);
  try {
    return json({ ticket: await createTicket(user, b) }, 201);
  } catch (e) {
    if (e instanceof SupportError) return error(e.code, e.status);
    throw e;
  }
});
