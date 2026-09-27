import { requireAdmin } from "@/lib/auth/admin";
import { body, error, handle, json } from "@/lib/http";
import { adminGetTicket, adminUpdateTicket, staffReply, SupportError } from "@/lib/support/tickets";

export const maxDuration = 60;
type Ctx = { params: Promise<{ id: string }> };

const wrap = async (fn: () => Promise<Response>) => {
  try {
    return await fn();
  } catch (e) {
    if (e instanceof SupportError) return error(e.code, e.status);
    throw e;
  }
};

export const GET = handle(async (_req: Request, { params }: Ctx) => {
  const a = await requireAdmin();
  if (!a.ok) return a.response;
  const { id } = await params;
  return wrap(async () => json(await adminGetTicket(id)));
});

/** { message, attachments?, close? } — a reply from the team. */
export const POST = handle(async (req: Request, { params }: Ctx) => {
  const a = await requireAdmin();
  if (!a.ok) return a.response;
  const { id } = await params;
  const b = await body<{ message?: unknown; attachments?: unknown; close?: unknown }>(req);
  if (!b) return error("invalidBody", 400);
  return wrap(async () => json({ ticket: await staffReply(a.user, id, b) }));
});

/** { status?, assignedTo? (email or null), priority? } */
export const PATCH = handle(async (req: Request, { params }: Ctx) => {
  const a = await requireAdmin();
  if (!a.ok) return a.response;
  const { id } = await params;
  const b = await body<{ status?: unknown; assignedTo?: unknown; priority?: unknown }>(req);
  if (!b) return error("invalidBody", 400);
  return wrap(async () => json({ ticket: await adminUpdateTicket(id, b) }));
});
