import { NextResponse } from "next/server";
import { currentUser } from "@/lib/auth/session";
import { authorizeUrl, newState, providerMode, sealState, STATE_COOKIE, type SocialProvider } from "@/lib/auth/social";
import { handle } from "@/lib/http";
import { siteUrl } from "@/lib/site";

/** Starts Google / Apple sign-in: ?locale=ar&next=/ar/account&mode=login|link */
export const GET = handle(async (req: Request, { params }: { params: Promise<{ provider: string }> }) => {
  const provider = (await params).provider as SocialProvider;
  const q = new URL(req.url).searchParams;
  const locale = q.get("locale") === "en" ? "en" : "ar";
  if ((provider !== "google" && provider !== "apple") || !providerMode(provider)) return NextResponse.redirect(`${siteUrl(req)}/${locale}/login?error=unavailable`);
  const mode = q.get("mode") === "link" ? "link" : "login";
  if (mode === "link" && !(await currentUser())) return NextResponse.redirect(`${siteUrl(req)}/${locale}/login`);
  const next = q.get("next") ?? "";
  const s = newState(provider, { locale, mode, next: next.startsWith(`/${locale}/`) ? next : `/${locale}/account` });
  const res = NextResponse.redirect(authorizeUrl(s, siteUrl(req)));
  // Apple returns with a cross-site form POST, so the cookie must be SameSite=None (and Secure).
  res.cookies.set(STATE_COOKIE, sealState(s), { httpOnly: true, secure: true, sameSite: "none", path: "/api/auth/oauth", maxAge: 600 });
  return res;
});
