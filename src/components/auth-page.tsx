"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { Suspense } from "react";
import { useApp } from "./app-provider";
import { AuthForm } from "./auth-form";
import { BackLink } from "./back-link";
import { Logo } from "./icons";
import { Card } from "./ui";

function Inner({ mode }: { mode: "login" | "register" }) {
  const { t, locale } = useApp();
  const router = useRouter();
  const next = useSearchParams().get("next");
  const safeNext = next && next.startsWith(`/${locale}/`) ? next : `/${locale}/account`;
  return (
    <div className="mx-auto max-w-2xl px-4 py-10 sm:py-14">
      <BackLink href={next && next.startsWith(`/${locale}/`) ? next : `/${locale}`} label={next ? t.common.back : t.nav.home} className="-ms-2.5 mb-3" />
      <Card className="p-6 sm:p-8">
        <div className="mb-6 flex items-center gap-3">
          <Logo className="size-10" />
          <div>
            <h1 className="text-xl font-bold">{mode === "login" ? t.auth.loginTitle : t.auth.registerTitle}</h1>
            <p className="text-sm text-slate-500">{t.meta.appName}</p>
          </div>
        </div>
        <AuthForm initialMode={mode} onSuccess={() => { router.push(safeNext); router.refresh(); }} />
      </Card>
    </div>
  );
}

export function AuthPage({ mode }: { mode: "login" | "register" }) {
  return <Suspense><Inner mode={mode} /></Suspense>;
}
