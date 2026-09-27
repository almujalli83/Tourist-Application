import { requireAdmin } from "@/lib/auth/admin";
import { handle, json } from "@/lib/http";
import { seedSupportQueue } from "@/lib/support/demo";
import { adminListTickets } from "@/lib/support/tickets";

/** Back office: tickets (?status=open|waiting|closed|all&priority=high|normal&mine=1). */
export const GET = handle(async (req: Request) => {
  const a = await requireAdmin();
  if (!a.ok) return a.response;
  await seedSupportQueue();
  const q = new URL(req.url).searchParams;
  const status = q.get("status");
  const priority = q.get("priority");
  const tickets = await adminListTickets({
    status: status === "open" || status === "waiting" || status === "closed" || status === "all" ? status : "open",
    priority: priority === "high" || priority === "normal" ? priority : "all",
    mine: q.get("mine") === "1" ? a.user.email : undefined,
  });
  const all = await adminListTickets({ status: "all" });
  const counts = {
    open: all.filter((t) => t.status === "open").length, waiting: all.filter((t) => t.status === "waiting").length,
    high: all.filter((t) => t.status !== "closed" && t.priority === "high").length, complaints: all.filter((t) => t.status !== "closed" && t.category === "complaint").length,
  };
  return json({ tickets, counts, me: a.user.email });
});
