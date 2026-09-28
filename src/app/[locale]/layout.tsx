import type { Metadata, Viewport } from "next";
import { cookies } from "next/headers";
import { notFound } from "next/navigation";
import type { ReactNode } from "react";
import { A11Y_BOOT } from "@/components/a11y-tools";
import { AppProvider } from "@/components/app-provider";
import { AssistantWidget } from "@/components/assistant/assistant-widget";
import { PrayerAlerts } from "@/components/prayer/prayer-alerts";
import { PrivacyBanner } from "@/components/privacy-banner";
import { SosButton } from "@/components/emergency/sos-button";
import { WeatherBanner } from "@/components/alerts/weather-banner";
import { SiteFooter } from "@/components/site-footer";
import { SiteHeader } from "@/components/site-header";
import { getDictionary } from "@/i18n";
import { isLocale, UI_COOKIE, uiDir, uiLangFor } from "@/i18n/config";
import { pageDictionary } from "@/i18n/server";
import { currentUser } from "@/lib/auth/session";
import { getCurrency } from "@/lib/currency";
import "../globals.css";

/** The header depends on the session and currency cookies. */
export const dynamic = "force-dynamic";

export async function generateMetadata({ params }: { params: Promise<{ locale: string }> }): Promise<Metadata> {
  const { locale } = await params;
  if (!isLocale(locale)) return {};
  const t = await pageDictionary(locale);
  return {
    title: { default: t.meta.appName, template: `%s — ${t.meta.appName}` },
    description: t.meta.description,
    manifest: "/manifest.webmanifest",
    icons: { icon: "/icon.svg", apple: "/apple-touch-icon.png" },
    alternates: { languages: { ar: "/ar", en: "/en" } },
  };
}

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  themeColor: "#05372b",
};

export default async function LocaleLayout({ children, params }: { children: ReactNode; params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  if (!isLocale(locale)) notFound();
  const store = await cookies();
  const currency = getCurrency(store.get("ta_currency")?.value ?? "SAR").code;
  const user = await currentUser();
  const uiLang = uiLangFor(locale, store.get(UI_COOKIE)?.value);
  const dict = getDictionary(locale, uiLang);
  return (
    <html lang={uiLang} dir={uiDir(uiLang)} suppressHydrationWarning>
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="" />
        {/* eslint-disable-next-line @next/next/no-page-custom-font */}
        <link href="https://fonts.googleapis.com/css2?family=IBM+Plex+Sans+Arabic:wght@300;400;500;600;700&display=swap" rel="stylesheet" />
        {/* The viewer's accessibility choices, applied before the page paints. */}
        <script dangerouslySetInnerHTML={{ __html: A11Y_BOOT }} />
      </head>
      <body className="flex min-h-dvh flex-col">
        <AppProvider locale={locale} uiLang={uiLang} dict={dict} initialCurrency={currency} initialUser={user}>
          <a href="#main" className="skip-link">{dict.a11y.skip}</a>
          <SiteHeader />
          <PrivacyBanner />
          <WeatherBanner />
          <main id="main" tabIndex={-1} className="flex-1 focus:outline-none">{children}</main>
          <SiteFooter />
          <AssistantWidget />
          <PrayerAlerts />
          <SosButton />
        </AppProvider>
      </body>
    </html>
  );
}
