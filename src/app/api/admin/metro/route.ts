import { requireAdmin } from "@/lib/auth/admin";
import { error, handle, json } from "@/lib/http";
import { getMetro, resetMetroCache, syncMetro } from "@/lib/metro/provider";

export const GET = handle(async () => {
  const a = await requireAdmin();
  if (!a.ok) return a.response;
  const net = await getMetro();
  return json({ source: net.source, fetchedAt: net.fetchedAt, stations: net.stations.length });
});

/** Fetches the stations again from the open-data link. */
export const POST = handle(async () => {
  const a = await requireAdmin();
  if (!a.ok) return a.response;
  try {
    const net = await syncMetro();
    resetMetroCache();
    return json({ source: net.source, fetchedAt: net.fetchedAt, stations: net.stations.length });
  } catch {
    return error("sourceUnavailable", 502);
  }
});
