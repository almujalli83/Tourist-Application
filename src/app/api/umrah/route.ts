import { currentUser } from "@/lib/auth/session";
import { handle, json } from "@/lib/http";
import { nusukLinked, nusukLinks } from "@/lib/umrah/nusuk";
import { getUmrahSeason } from "@/lib/umrah/season";
import { listUmrahTrips } from "@/lib/umrah/trips";

/** The Umrah page: the Hajj-season pause, Nusuk links, and the signed-in traveller's Umrah trips. */
export const GET = handle(async () => {
  const user = await currentUser();
  return json({
    season: await getUmrahSeason(),
    links: nusukLinks(),
    linked: nusukLinked(),
    trips: user ? await listUmrahTrips(user.id) : null,
  });
});
