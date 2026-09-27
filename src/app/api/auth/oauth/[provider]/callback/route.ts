import { NextResponse } from "next/server";
import { AccountError } from "@/lib/auth/account";
import { maskEmail } from "@/lib/auth/identities";
import { currentUser } from "@/lib/auth/session";
import { resolveIdentity } from "@/lib/auth/signin";
import { exchangeCode, openState, SocialError, STATE_COOKIE, type SocialProvider } from "@/lib/auth/social";
import { handle } from "@/lib/http";
import { siteUrl } from "@/lib/site";

async function finish(req: Request, provider: string, code: string | null, state: string | null, appleUser: string | null) {
  const site = siteUrl(req);
  const cookie = req.headers.get("cookie")?.split(/;\s*/).find((c) => c.startsWith(`${STATE_COOKIE}=`))?.slice(STATE_COOKIE.length + 1);
  const s = openState(cookie ? decodeURIComponent(cookie) : undefined);
  const locale = s?.locale ?? "ar";
  const back = (path: string) => {
    const res = NextResponse.redirect(`${site}${path}`, 303);
    res.cookies.set(STATE_COOKIE, "", { httpOnly: true, secure: true, sameSite: "none", path: "/api/auth/oauth", maxAge: 0 });
    return res;
  };
  const fail = (code: string) => back(s?.mode === "link" ? `/${locale}/account/security?error=${code}` : `/${locale}/login?error=${code}`);
  if (!s || s.provider !== provider || !state || state !== s.state || !code) return fail("expired");
  try {
    const p = await exchangeCode(s, code, site);
    // Apple sends the name only on the first sign-in, in the form.
    let name = p.name;
    if (!name && appleUser) {
      try {
        const u = JSON.parse(appleUser) as { name?: { firstName?: string; lastName?: string } };
        name = [u.name?.firstName, u.name?.lastName].filter(Boolean).join(" ") || null;
      } catch {
        // ignore
      }
    }
    const user = await currentUser();
    const r = await resolveIdentity(
      { provider: s.provider as SocialProvider, subject: p.subject, label: p.email ? maskEmail(p.email) : s.provider, sandbox: p.sandbox, name, email: p.email, emailVerified: p.emailVerified },
      req,
      { mode: s.mode, userId: user?.id ?? null, locale },
    );
    if (r.status === "linked") return back(`/${locale}/account/security?linked=${provider}`);
    if (r.status === "signup") return back(`/${locale}/complete-signup?ticket=${r.ticket}`);
    if (r.status === "mfa") return back(`/${locale}/login?mfa=${r.ticket}&next=${encodeURIComponent(s.next)}`);
    return back(s.next);
  } catch (e) {
    if (e instanceof AccountError || e instanceof SocialError) return fail(e.message);
    throw e;
  }
}

type Ctx = { params: Promise<{ provider: string }> };

/** Google (and the sandbox) return with a GET. */
export const GET = handle(async (req: Request, { params }: Ctx) => {
  const q = new URL(req.url).searchParams;
  return finish(req, (await params).provider, q.get("code"), q.get("state"), null);
});

/** Apple returns with a form POST. */
export const POST = handle(async (req: Request, { params }: Ctx) => {
  const f = await req.formData().catch(() => null);
  const v = (k: string) => (typeof f?.get(k) === "string" ? (f!.get(k) as string) : null);
  return finish(req, (await params).provider, v("code"), v("state"), v("user"));
});
