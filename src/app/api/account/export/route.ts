import { exportData } from "@/lib/auth/account";
import { signedIn } from "@/lib/auth/respond";
import { handle } from "@/lib/http";

/** A copy of the account's data (JSON download). */
export const GET = handle(async () => {
  const s = await signedIn();
  if (s instanceof Response) return s;
  const data = await exportData(s.userId);
  return new Response(JSON.stringify(data, null, 2), {
    headers: {
      "content-type": "application/json; charset=utf-8",
      "content-disposition": `attachment; filename="saudi-trip-data-${new Date().toISOString().slice(0, 10)}.json"`,
      "cache-control": "no-store",
    },
  });
});
