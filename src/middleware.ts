import { NextResponse, type NextRequest } from "next/server";
import { DEFAULT_LOCALE, LOCALES } from "./i18n/config";

/** Redirects locale-less paths to the preferred locale (/ar by default). */
export function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;
  if (LOCALES.some((l) => pathname === `/${l}` || pathname.startsWith(`/${l}/`))) return NextResponse.next();
  const cookie = req.cookies.get("ta_locale")?.value;
  const accept = req.headers.get("accept-language") ?? "";
  const locale = cookie && (LOCALES as readonly string[]).includes(cookie)
    ? cookie
    : /^en/i.test(accept) ? "en" : DEFAULT_LOCALE;
  const url = req.nextUrl.clone();
  url.pathname = `/${locale}${pathname === "/" ? "" : pathname}`;
  return NextResponse.redirect(url);
}

export const config = {
  matcher: ["/((?!api|_next|tesseract|favicon.ico|icon.svg|manifest.webmanifest|robots.txt|.*\\..*).*)"],
};
