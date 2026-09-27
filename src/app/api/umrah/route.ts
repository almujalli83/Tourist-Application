import { currentUser } from "@/lib/auth/session";
import { handle, json } from "@/lib/http";
import { nusukLinks, nusukProvider } from "@/lib/umrah/nusuk";
import { permitQrSvg } from "@/lib/umrah/permits";
import { getUmrahSeason } from "@/lib/umrah/season";
import { listUmrahTrips } from "@/lib/umrah/trips";

/** The Umrah page: the Hajj-season pause, Nusuk links, and the signed-in traveller's Umrah trips. */
export const GET = handle(async () => {
  const user = await currentUser();
  return json({
    season: await getUmrahSeason(),
    links: nusukLinks(),
    /** Automatic permits: through the Nusuk API, the sandbox simulation, or none (links only). */
    nusuk: nusukProvider()?.mode ?? null,
    trips: user
      ? await Promise.all((await listUmrahTrips(user.id)).map(async (t) => ({ ...t, permits: await Promise.all(t.permits.map(async (p) => ({ ...p, qrSvg: await permitQrSvg(p) }))) })))
      : null,
  });
});
