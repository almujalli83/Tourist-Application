import { nafathMode } from "@/lib/auth/nafath";
import { smsSandbox } from "@/lib/auth/sms";
import { providerMode } from "@/lib/auth/social";
import { handle, json } from "@/lib/http";

/** Sign-in methods offered: "live", "sandbox" or null. */
export const GET = handle(async () =>
  json({ google: providerMode("google"), apple: providerMode("apple"), nafath: nafathMode(), phone: smsSandbox() ? "sandbox" : "live" }));
